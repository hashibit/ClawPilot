import { Router } from 'express'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import unzipper from 'unzipper'
import { Readable } from 'stream'
import { createLogger } from '../logger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Bundle skills metadata - single source of truth
const BUNDLE_SKILLS_METADATA_PATH = path.resolve(__dirname, '../../bundle/bundled-skills-metadata.json')
const BUNDLE_SKILLS_DIR = path.resolve(__dirname, '../../bundle/skills')
const USER_SKILLS_DIR = path.resolve(__dirname, '../../skills')
const SKILLS_DIR = fs.existsSync(BUNDLE_SKILLS_DIR) && fs.readdirSync(BUNDLE_SKILLS_DIR).length > 0
  ? BUNDLE_SKILLS_DIR
  : USER_SKILLS_DIR

const now = () => Math.floor(Date.now() / 1000)
const log = createLogger('skill')
const CLAWHUB_CONVEX = 'https://wry-manatee-359.convex.cloud/api/action'
const LIGHTMAKE_BASE = 'https://lightmake.site/api'
/** @deprecated kept for backward compat in sync_skills */
const CLAWHUB_BASE = LIGHTMAKE_BASE

function ensureSkillsDir() {
  if (!fs.existsSync(SKILLS_DIR)) fs.mkdirSync(SKILLS_DIR, { recursive: true })
}

/**
 * 从 bundled-skills-metadata.json 加载技能元数据
 */
function loadBundleSkillsMetadata() {
  try {
    if (!fs.existsSync(BUNDLE_SKILLS_METADATA_PATH)) return null
    const content = fs.readFileSync(BUNDLE_SKILLS_METADATA_PATH, 'utf8')
    return JSON.parse(content)
  } catch (e) {
    log.warn(`Failed to load bundle skills metadata: ${e.message}`)
    return null
  }
}

/**
 * 启动时注册 bundle 中的技能到数据库
 * 基于 bundled-skills-metadata.json 中的元数据
 */
export function registerBundleSkills(db) {
  const metadata = loadBundleSkillsMetadata()
  const skills = metadata?.skills || []

  if (skills.length === 0) {
    log.info('No bundle skills metadata found, skipping registration')
    return
  }

  const now = Math.floor(Date.now() / 1000)
  let registered = 0

  for (const skill of skills) {
    const { slug, name, display_name, description, category } = skill
    const skillDir = path.join(BUNDLE_SKILLS_DIR, slug)

    // 只有技能目录存在时才注册
    if (!fs.existsSync(skillDir)) {
      log.warn(`Skill directory not found: ${slug}, skipping`)
      continue
    }

    // 检查是否已存在
    const existing = db.prepare('SELECT id FROM skills WHERE slug = ?').get(slug)

    if (existing) {
      // 更新现有技能
      db.prepare(`
        UPDATE skills SET
          display_name = ?, description = ?, category = ?, is_installed = 1,
          install_path = ?
        WHERE slug = ?
      `).run(display_name || slug, description || '', category || 'general', skillDir, slug)
    } else {
      // 插入新技能
      db.prepare(`
        INSERT INTO skills (
          name, display_name, description, slug, category,
          is_local, is_installed, install_path,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?, ?)
      `).run(
        name || slug, display_name || slug, description || '', slug, category || 'general', skillDir, now, now
      )
      registered++
    }
  }

  log.info(`Registered ${registered} bundle skills from ${BUNDLE_SKILLS_DIR}`)
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

export function createSkillRouter(db) {
  const log = createLogger('skill')
  const router = Router()

  function writeLog(level, message) {
    try {
      db.prepare('INSERT INTO log_entries (timestamp, level, component, message) VALUES (?, ?, ?, ?)')
        .run(Math.floor(Date.now() / 1000), level, 'skill', message)
    } catch (_) {}
    const lvl = level.toLowerCase()
    if (lvl === 'error') log.error(message)
    else if (lvl === 'warn') log.warn(message)
    else log.info(message)
  }

  // get_bundle_skills_metadata - Returns the bundled-skills-metadata.json content
  router.get('/get_bundle_skills_metadata', (_req, res) => {
    try {
      const metadataPath = path.resolve(__dirname, '../../bundle/bundled-skills-metadata.json')
      if (!fs.existsSync(metadataPath)) {
        return res.status(404).json({ error: 'Bundle skills metadata not found' })
      }
      const content = fs.readFileSync(metadataPath, 'utf8')
      res.json(JSON.parse(content))
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // get_skills
  router.post('/get_skills', (_req, res) => {
    try {
      const rows = db.prepare('SELECT * FROM skills ORDER BY is_installed DESC, created_at DESC').all()
      res.json(rows.map(rowToSkill))
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // create_skill
  router.post('/create_skill', (req, res) => {
    try {
      const { skill } = req.body
      if (!skill?.name?.trim()) return res.status(400).json({ error: 'name is required' })
      if (!skill?.display_name?.trim()) return res.status(400).json({ error: 'display_name is required' })

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
      writeLog('INFO', `技能已创建: ${skill.name}`)
      res.json(result.lastInsertRowid)
    } catch (err) {
      if (err.message.includes('UNIQUE')) return res.status(400).json({ error: '技能名称已存在' })
      res.status(500).json({ error: err.message })
    }
  })

  // delete_skill
  router.post('/delete_skill', (req, res) => {
    try {
      const { id } = req.body
      const row = db.prepare('SELECT * FROM skills WHERE id = ? AND is_local = 1').get(Number(id))
      if (row?.install_path && fs.existsSync(row.install_path)) {
        fs.rmSync(row.install_path, { recursive: true, force: true })
      }
      db.prepare('DELETE FROM skills WHERE id = ? AND is_local = 1').run(Number(id))
      writeLog('INFO', `技能已删除: id=${id}`)
      res.json({ ok: true })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // sync_skills
  router.post('/sync_skills', async (_req, res) => {
    try {
      const r = await fetch(
        `${CLAWHUB_BASE}/skills?page=1&pageSize=100&sortBy=score&order=desc`,
        { signal: AbortSignal.timeout(15000) }
      )
      if (!r.ok) return res.status(502).json({ error: `ClawHub 返回 ${r.status}` })

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
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      res.status(500).json({ error: err.message })
    }
  })

  // install_skill
  router.post('/install_skill', async (req, res) => {
    try {
      const { slug } = req.body
      if (!slug) return res.status(400).json({ error: 'slug is required' })

      const row = db.prepare('SELECT * FROM skills WHERE slug = ?').get(slug)
      const downloadUrl = row?.download_url || `${CLAWHUB_BASE}/skills/${slug}/download`

      log.info(`install_skill: ${slug} from ${downloadUrl}`)

      const r = await fetch(downloadUrl, { signal: AbortSignal.timeout(30000) })
      if (!r.ok) return res.status(502).json({ error: `下载失败 ${r.status}: ${slug}` })

      const buf = Buffer.from(await r.arrayBuffer())

      ensureSkillsDir()
      const skillDir = path.join(SKILLS_DIR, slug)
      if (fs.existsSync(skillDir)) fs.rmSync(skillDir, { recursive: true, force: true })
      fs.mkdirSync(skillDir, { recursive: true })

      await new Promise((resolve, reject) => {
        Readable.from(buf)
          .pipe(unzipper.Extract({ path: skillDir }))
          .on('close', resolve)
          .on('error', reject)
      })

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

      writeLog('INFO', `技能已安装: ${slug} → ${skillDir}`)
      const updated = rowToSkill(db.prepare('SELECT * FROM skills WHERE slug = ?').get(slug))
      res.json(updated)
    } catch (err) {
      writeLog('ERROR', `技能安装失败: ${slug}, ${err.message}`)
      res.status(500).json({ error: err.message })
    }
  })

  // uninstall_skill
  router.post('/uninstall_skill', (req, res) => {
    try {
      const { slug } = req.body
      if (!slug) return res.status(400).json({ error: 'slug is required' })

      const row = db.prepare('SELECT * FROM skills WHERE slug = ?').get(slug)
      const skillDir = row?.install_path || path.join(SKILLS_DIR, slug)

      if (fs.existsSync(skillDir)) fs.rmSync(skillDir, { recursive: true, force: true })

      if (row?.is_local) {
        db.prepare('DELETE FROM skills WHERE slug = ?').run(slug)
      } else {
        db.prepare('UPDATE skills SET is_installed = 0, install_path = NULL, installed_at = NULL WHERE slug = ?')
          .run(slug)
      }

      writeLog('INFO', `技能已卸载: ${slug}`)
      res.json({ ok: true })
    } catch (err) {
      log.error(`uninstall_skill: ${err.message}`)
      res.status(500).json({ error: err.message })
    }
  })

  // search_skills — proxies to clawhub.ai (Convex) or lightmake.site
  // body: { q: string, source?: 'clawhub' | 'lightmake', limit?: number }
  router.post('/search_skills', async (req, res) => {
    try {
      const { q, source = 'clawhub', limit = 25 } = req.body
      if (!q?.trim()) return res.json([])

      if (source === 'clawhub') {
        const r = await fetch(CLAWHUB_CONVEX, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'convex-client': 'npm-1.34.0' },
          body: JSON.stringify({
            path: 'search:searchSkills',
            format: 'convex_encoded_json',
            args: [{ query: q.trim(), highlightedOnly: false, nonSuspiciousOnly: false, limit }],
          }),
          signal: AbortSignal.timeout(10000),
        })
        if (!r.ok) return res.status(502).json({ error: `clawhub ${r.status}` })
        const data = await r.json()
        if (data.errorMessage) return res.status(502).json({ error: data.errorMessage })
        const skills = (data.value ?? []).map(item => ({
          slug: item.skill.slug,
          name: item.skill.displayName,
          description: item.skill.summary ?? '',
          downloads: Math.round(item.skill.stats?.downloads ?? 0),
          stars: Math.round(item.skill.stats?.stars ?? 0),
          ownerName: item.ownerHandle ?? '',
          version: item.version?.version ?? '',
          score: item.score,
        }))
        return res.json(skills)
      } else {
        // lightmake.site
        const r = await fetch(
          `${LIGHTMAKE_BASE}/skills?page=1&pageSize=${limit}&sortBy=score&order=desc&keyword=${encodeURIComponent(q.trim())}`,
          { signal: AbortSignal.timeout(10000) }
        )
        if (!r.ok) return res.status(502).json({ error: `lightmake ${r.status}` })
        const data = await r.json()
        return res.json(data?.data?.skills ?? [])
      }
    } catch (err) {
      log.error(`search_skills: ${err.message}`)
      res.status(500).json({ error: err.message })
    }
  })

  return router
}

// Backward compatibility
export default createSkillRouter
