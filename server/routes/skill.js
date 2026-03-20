import { Router } from 'express'
import db from '../db.js'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import unzipper from 'unzipper'
import { Readable } from 'stream'
import { createLogger } from '../logger.js'
const log = createLogger('skill')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Dev mode: skills dir at project root (ClawPilot/skills/)
const SKILLS_DIR = path.resolve(__dirname, '../../skills')

const router = Router()
const now = () => Math.floor(Date.now() / 1000)
const CLAWHUB_BASE = 'https://lightmake.site/api'

function ensureSkillsDir() {
  if (!fs.existsSync(SKILLS_DIR)) fs.mkdirSync(SKILLS_DIR, { recursive: true })
}

function rowToSkill(row) {
  if (!row) return null
  return {
    ...row,
    tags: row.tags ? (() => { try { return JSON.parse(row.tags) } catch { return [] } })() : [],
    is_installed: row.is_installed === 1,
    is_local: row.is_local === 1,
  }
}

// ── POST /api/get_skills ─────────────────────────────────────
router.post('/get_skills', (_req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM skills ORDER BY is_installed DESC, created_at DESC').all()
    res.json(rows.map(rowToSkill))
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// ── POST /api/create_skill  { skill } ────────────────────────
router.post('/create_skill', (req, res) => {
  try {
    const { skill } = req.body
    if (!skill?.name?.trim()) return res.status(400).send('name is required')
    if (!skill?.display_name?.trim()) return res.status(400).send('display_name is required')

    const ts = now()
    const slug = skill.slug || skill.name.trim().toLowerCase().replace(/\s+/g, '-')
    const result = db.prepare(`
      INSERT INTO skills (name, display_name, description, category, slug, is_local, is_installed, created_at)
      VALUES (?, ?, ?, ?, ?, 1, 1, ?)
    `).run(
      skill.name.trim(),
      skill.display_name.trim(),
      skill.description?.trim() ?? '',
      skill.category?.trim() ?? 'general',
      slug,
      ts,
    )
    res.json(result.lastInsertRowid)
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).send('技能名称已存在')
    res.status(500).send(err.message)
  }
})

// ── POST /api/delete_skill  { id } ───────────────────────────
router.post('/delete_skill', (req, res) => {
  try {
    const { id } = req.body
    const row = db.prepare('SELECT * FROM skills WHERE id = ? AND is_local = 1').get(Number(id))
    if (row?.install_path && fs.existsSync(row.install_path)) {
      fs.rmSync(row.install_path, { recursive: true, force: true })
    }
    db.prepare('DELETE FROM skills WHERE id = ? AND is_local = 1').run(Number(id))
    res.json({ ok: true })
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// ── POST /api/sync_skills ─────────────────────────────────────
// Fetch metadata from ClawHub, upsert to DB (marks is_installed based on local dir)
router.post('/sync_skills', async (_req, res) => {
  try {
    const r = await fetch(
      `${CLAWHUB_BASE}/skills?page=1&pageSize=100&sortBy=score&order=desc`,
      { signal: AbortSignal.timeout(15000) }
    )
    if (!r.ok) return res.status(502).send(`ClawHub 返回 ${r.status}`)

    const data = await r.json()
    const skills = data?.data?.skills ?? []
    const ts = now()
    let count = 0

    for (const s of skills) {
      const slug = s.slug
      if (!slug) continue

      const downloadUrl = `${CLAWHUB_BASE}/skills/${slug}/download`
      const skillDir = path.join(SKILLS_DIR, slug)
      const alreadyInstalled = fs.existsSync(skillDir) ? 1 : 0

      const existing = db.prepare('SELECT id FROM skills WHERE slug = ?').get(slug)
      if (existing) {
        db.prepare(`
          UPDATE skills SET
            display_name = ?, description = ?, version = ?,
            author = ?, tags = ?, url = ?, download_url = ?,
            is_installed = CASE WHEN is_installed = 1 THEN 1 ELSE ? END
          WHERE slug = ?
        `).run(
          s.name || slug,
          s.description_zh || s.description || '',
          s.version || '1.0.0',
          s.ownerName || '',
          JSON.stringify(s.tags ?? []),
          `https://clawhub.ai/skills/${slug}`,
          downloadUrl,
          alreadyInstalled,
          slug
        )
      } else {
        db.prepare(`
          INSERT INTO skills
            (name, display_name, description, slug, version, author, tags, url,
             download_url, category, is_local, is_installed, install_path, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
        `).run(
          slug,
          s.name || slug,
          s.description_zh || s.description || '',
          slug,
          s.version || '1.0.0',
          s.ownerName || '',
          JSON.stringify(s.tags ?? []),
          `https://clawhub.ai/skills/${slug}`,
          downloadUrl,
          s.category || 'general',
          alreadyInstalled,
          alreadyInstalled ? skillDir : null,
          ts
        )
      }
      count++
    }

    log.info(`sync_skills: synced ${count} skills from ClawHub`)
    res.json({ ok: true, count })
  } catch (err) {
    log.error(`sync_skills: ${err.message}`)
    res.status(500).send(err.message)
  }
})

// ── POST /api/install_skill { slug } ─────────────────────────
router.post('/install_skill', async (req, res) => {
  try {
    const { slug } = req.body
    if (!slug) return res.status(400).send('slug is required')

    const row = db.prepare('SELECT * FROM skills WHERE slug = ?').get(slug)
    const downloadUrl = row?.download_url || `${CLAWHUB_BASE}/skills/${slug}/download`

    log.info(`install_skill: ${slug} from ${downloadUrl}`)

    const r = await fetch(downloadUrl, { signal: AbortSignal.timeout(30000) })
    if (!r.ok) return res.status(502).send(`下载失败 ${r.status}: ${slug}`)

    const buf = Buffer.from(await r.arrayBuffer())

    ensureSkillsDir()
    const skillDir = path.join(SKILLS_DIR, slug)
    if (fs.existsSync(skillDir)) fs.rmSync(skillDir, { recursive: true, force: true })
    fs.mkdirSync(skillDir, { recursive: true })

    // Extract zip
    await new Promise((resolve, reject) => {
      Readable.from(buf)
        .pipe(unzipper.Extract({ path: skillDir }))
        .on('close', resolve)
        .on('error', reject)
    })

    // Flatten single top-level dir (common in GitHub zips)
    const entries = fs.readdirSync(skillDir)
    if (entries.length === 1 && fs.statSync(path.join(skillDir, entries[0])).isDirectory()) {
      const nested = path.join(skillDir, entries[0])
      for (const f of fs.readdirSync(nested)) {
        fs.renameSync(path.join(nested, f), path.join(skillDir, f))
      }
      fs.rmdirSync(nested)
    }

    const ts = now()
    if (row) {
      db.prepare('UPDATE skills SET is_installed = 1, install_path = ?, installed_at = ? WHERE slug = ?')
        .run(skillDir, ts, slug)
    } else {
      db.prepare(`
        INSERT INTO skills (name, display_name, slug, is_local, is_installed, install_path, installed_at, created_at)
        VALUES (?, ?, ?, 0, 1, ?, ?, ?)
      `).run(slug, slug, slug, skillDir, ts, ts)
    }

    log.info(`install_skill: OK → ${skillDir}`)
    const updated = rowToSkill(db.prepare('SELECT * FROM skills WHERE slug = ?').get(slug))
    res.json(updated)
  } catch (err) {
    log.error(`install_skill: ${err.message}`)
    res.status(500).send(err.message)
  }
})

// ── POST /api/uninstall_skill { slug } ───────────────────────
router.post('/uninstall_skill', (req, res) => {
  try {
    const { slug } = req.body
    if (!slug) return res.status(400).send('slug is required')

    const row = db.prepare('SELECT * FROM skills WHERE slug = ?').get(slug)
    const skillDir = row?.install_path || path.join(SKILLS_DIR, slug)

    if (fs.existsSync(skillDir)) fs.rmSync(skillDir, { recursive: true, force: true })

    if (row?.is_local) {
      db.prepare('DELETE FROM skills WHERE slug = ?').run(slug)
    } else {
      db.prepare('UPDATE skills SET is_installed = 0, install_path = NULL, installed_at = NULL WHERE slug = ?')
        .run(slug)
    }

    log.info(`uninstall_skill: ${slug}`)
    res.json({ ok: true })
  } catch (err) {
    log.error(`uninstall_skill: ${err.message}`)
    res.status(500).send(err.message)
  }
})

export default router
