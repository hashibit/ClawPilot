import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createTestDb, makeOffice } from '../helpers/db.js'
import { createTestApp } from '../helpers/app.js'
import {
  detectPlatformArch,
  buildOfflinePackageUrl,
  parseSha256Content,
  normalizeArch
} from '../../routes/office.js'

describe('Office Routes', () => {
  let db, app

  beforeEach(() => {
    db = createTestDb()
    app = createTestApp(db)
    // 清空预置的"本机办公室"数据，确保测试隔离
    db.prepare('DELETE FROM offices').run()
  })

  describe('get_offices', () => {
    it('返回空数组（无Office）', async () => {
      const res = await request(app).post('/api/get_offices').send({})
      expect(res.status).toBe(200)
      expect(res.body).toEqual([])
    })

    it('返回所有Office', async () => {
      makeOffice(db, { name: 'Office 1' })
      makeOffice(db, { name: 'Office 2' })

      const res = await request(app).post('/api/get_offices').send({})
      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(2)
    })
  })

  describe('get_office', () => {
    it('返回指定Office详情', async () => {
      const office = makeOffice(db, { name: 'Detail Office' })

      const res = await request(app).post('/api/get_office').send({ id: office.id })
      expect(res.status).toBe(200)
      expect(res.body.name).toBe('Detail Office')
    })

    it('返回500（不存在）', async () => {
      const res = await request(app).post('/api/get_office').send({ id: 'non-existent' })
      expect(res.status).toBe(500)
    })
  })

  describe('create_office', () => {
    it('创建新Office', async () => {
      const officeData = {
        id: `office-${Date.now()}`,
        name: 'New Office'
      }

      const res = await request(app).post('/api/create_office').send({ office: officeData })
      expect(res.status).toBe(200)

      const getRes = await request(app).post('/api/get_offices').send({})
      expect(getRes.body).toHaveLength(1)
      expect(getRes.body[0].name).toBe('New Office')
    })
  })

  describe('update_office', () => {
    it('更新Office信息', async () => {
      const office = makeOffice(db, { name: 'Old Name' })

      const res = await request(app).post('/api/update_office').send({
        id: office.id,
        office: { name: 'New Name', address: 'New Address' }
      })
      expect(res.status).toBe(200)

      const getRes = await request(app).post('/api/get_office').send({ id: office.id })
      expect(getRes.body.name).toBe('New Name')
      expect(getRes.body.address).toBe('New Address')
    })
  })

  describe('delete_office', () => {
    it('删除Office', async () => {
      const office = makeOffice(db)

      const res = await request(app).post('/api/delete_office').send({ id: office.id })
      expect(res.status).toBe(200)

      const getRes = await request(app).post('/api/get_offices').send({})
      expect(getRes.body).toHaveLength(0)
    })
  })

  describe('check_daemon_health', () => {
    it('返回未配置错误（无daemon_url）', async () => {
      const res = await request(app).post('/api/check_daemon_health').send({})
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(false)
      expect(res.body.error).toContain('未配置')
    })
  })
})

// ── OpenClaw Offline Package Helper Tests ─────────────────────────────────────

describe('OpenClaw Offline Package Helpers', () => {
  describe('detectPlatformArch', () => {
    it('返回正确的平台和架构', () => {
      const { platform, arch } = detectPlatformArch()
      // 验证返回值是有效值
      expect(['darwin', 'linux', 'windows']).toContain(platform)
      expect(['x64', 'arm64']).toContain(arch)
    })
  })

  describe('buildOfflinePackageUrl', () => {
    it('为 Linux x64 生成正确的 URL', () => {
      const url = buildOfflinePackageUrl('2026.4.9', 'linux', 'x64')
      expect(url).toBe(
        'https://github.com/hashibit/openclaw-pkgs/releases/download/v2026.4.9/openclaw-pkgs-v2026.4.9-linux-x64.tar.gz'
      )
    })

    it('为 Linux arm64 生成正确的 URL', () => {
      const url = buildOfflinePackageUrl('2026.4.9', 'linux', 'arm64')
      expect(url).toBe(
        'https://github.com/hashibit/openclaw-pkgs/releases/download/v2026.4.9/openclaw-pkgs-v2026.4.9-linux-arm64.tar.gz'
      )
    })

    it('为 macOS arm64 生成正确的 URL', () => {
      const url = buildOfflinePackageUrl('2026.4.9', 'darwin', 'arm64')
      expect(url).toBe(
        'https://github.com/hashibit/openclaw-pkgs/releases/download/v2026.4.9/openclaw-pkgs-v2026.4.9-darwin-arm64.tar.gz'
      )
    })

    it('为 Windows x64 生成正确的 URL（使用 .zip 扩展名）', () => {
      const url = buildOfflinePackageUrl('2026.4.9', 'windows', 'x64')
      expect(url).toBe(
        'https://github.com/hashibit/openclaw-pkgs/releases/download/v2026.4.9/openclaw-pkgs-v2026.4.9-windows-x64.zip'
      )
    })

    it('为 Windows arm64 生成正确的 URL', () => {
      const url = buildOfflinePackageUrl('2026.4.9', 'windows', 'arm64')
      expect(url).toBe(
        'https://github.com/hashibit/openclaw-pkgs/releases/download/v2026.4.9/openclaw-pkgs-v2026.4.9-windows-arm64.zip'
      )
    })

    it('包含版本号', () => {
      const url = buildOfflinePackageUrl('2026.5.0', 'linux', 'x64')
      expect(url).toContain('v2026.5.0')
      expect(url).toContain('openclaw-pkgs-v2026.5.0')
    })
  })

  describe('parseSha256Content', () => {
    it('解析标准格式（hash + 文件名）', () => {
      const content = '3ea217398a2d7d2f62b65893dad9ba0963459047b0bfc3b78b7f6fd874ba7254  openclaw-pkgs.tar.gz'
      const hash = parseSha256Content(content)
      expect(hash).toBe('3ea217398a2d7d2f62b65893dad9ba0963459047b0bfc3b78b7f6fd874ba7254')
    })

    it('解析纯 hash 格式', () => {
      const content = '3ea217398a2d7d2f62b65893dad9ba0963459047b0bfc3b78b7f6fd874ba7254'
      const hash = parseSha256Content(content)
      expect(hash).toBe('3ea217398a2d7d2f62b65893dad9ba0963459047b0bfc3b78b7f6fd874ba7254')
    })

    it('处理前导空格', () => {
      const content = '   3ea217398a2d7d2f62b65893dad9ba0963459047b0bfc3b78b7f6fd874ba7254'
      const hash = parseSha256Content(content)
      expect(hash).toBe('3ea217398a2d7d2f62b65893dad9ba0963459047b0bfc3b78b7f6fd874ba7254')
    })

    it('处理后导空格', () => {
      const content = '3ea217398a2d7d2f62b65893dad9ba0963459047b0bfc3b78b7f6fd874ba7254   \n'
      const hash = parseSha256Content(content)
      expect(hash).toBe('3ea217398a2d7d2f62b65893dad9ba0963459047b0bfc3b78b7f6fd874ba7254')
    })
  })

  describe('normalizeArch', () => {
    it('arm64 返回 arm64', () => {
      expect(normalizeArch('arm64')).toBe('arm64')
    })

    it('aarch64 返回 arm64', () => {
      expect(normalizeArch('aarch64')).toBe('arm64')
    })

    it('x64 返回 x64', () => {
      expect(normalizeArch('x64')).toBe('x64')
    })

    it('x86_64 返回 x64', () => {
      expect(normalizeArch('x86_64')).toBe('x64')
    })

    it('其他值返回 x64', () => {
      expect(normalizeArch('ia32')).toBe('x64')
    })
  })
})
