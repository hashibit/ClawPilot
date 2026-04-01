import { Router } from 'express'
import { createLogger } from '../logger.js'
import { encrypt, decrypt } from '../utils/crypto.js'

const now = () => Math.floor(Date.now() / 1000)

function safeDecryptJson(v) {
  if (!v) return null
  try {
    const plain = decrypt(v)
    return JSON.parse(plain)
  } catch {
    // Fallback for unencrypted legacy rows
    try { return JSON.parse(v) } catch { return null }
  }
}

function rowToChannel(row) {
  if (!row) return null
  return {
    ...row,
    id: String(row.id),
    is_enabled: row.is_enabled === 1,
    is_connected: row.is_connected === 1,
    feishu_config: safeDecryptJson(row.feishu_config),
    dingtalk_config: safeDecryptJson(row.dingtalk_config),
    slack_config: safeDecryptJson(row.slack_config),
  }
}

function toEncryptedJsonStr(v) {
  if (!v) return null
  const str = typeof v === 'string' ? v : JSON.stringify(v)
  return encrypt(str)
}

export function createChannelRouter(db) {
  const log = createLogger('channel')
  const router = Router()

  function writeLog(level, message) {
    try {
      db.prepare('INSERT INTO log_entries (timestamp, level, component, message) VALUES (?, ?, ?, ?)')
        .run(Math.floor(Date.now() / 1000), level, 'channel', message)
    } catch (_) {}
    const lvl = level.toLowerCase()
    if (lvl === 'error') log.error(message)
    else if (lvl === 'warn') log.warn(message)
    else log.info(message)
  }

  // get_channels
  router.post('/get_channels', (req, res) => {
    try {
      const { opc_id } = req.body
      const rows = db.prepare('SELECT * FROM channels WHERE opc_id = ? ORDER BY id').all(opc_id)
      res.json(rows.map(rowToChannel))
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // get_channel
  router.post('/get_channel', (req, res) => {
    try {
      const { id } = req.body
      const row = db.prepare('SELECT * FROM channels WHERE id = ?').get(Number(id))
      if (!row) throw new Error(`Not found: ${id}`)
      res.json(rowToChannel(row))
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // upsert_channel
  router.post('/upsert_channel', (req, res) => {
    try {
      const { config } = req.body
      const feishuStr = toEncryptedJsonStr(config.feishu_config)
      const dingtalkStr = toEncryptedJsonStr(config.dingtalk_config)
      const slackStr = toEncryptedJsonStr(config.slack_config)

      const hasId = config.id && String(config.id) !== '0'

      if (hasId) {
        db.prepare(`
          UPDATE channels SET
            opc_id = ?, channel_type = ?, is_enabled = ?,
            feishu_config = ?, dingtalk_config = ?, slack_config = ?,
            is_connected = ?, last_connected = ?, updated_at = ?
          WHERE id = ?
        `).run(
          config.opc_id, config.channel_type,
          config.is_enabled ? 1 : 0,
          feishuStr, dingtalkStr, slackStr,
          config.is_connected ? 1 : 0, config.last_connected ?? null,
          now(), Number(config.id)
        )
        writeLog('INFO', `渠道已更新: ${config.channel_type} (${config.id})`)
        res.json(Number(config.id))
      } else {
        const result = db.prepare(`
          INSERT INTO channels
            (opc_id, channel_type, is_enabled, feishu_config, dingtalk_config, slack_config,
             is_connected, last_connected, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          config.opc_id, config.channel_type,
          config.is_enabled ? 1 : 0,
          feishuStr, dingtalkStr, slackStr,
          config.is_connected ? 1 : 0, config.last_connected ?? null,
          now(), now()
        )
        writeLog('INFO', `渠道已创建: ${config.channel_type}`)
        res.json(Number(result.lastInsertRowid))
      }
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // delete_channel
  router.post('/delete_channel', (req, res) => {
    try {
      const { id } = req.body
      db.prepare('DELETE FROM bindings WHERE channel_id = ?').run(Number(id))
      db.prepare('DELETE FROM channels WHERE id = ?').run(Number(id))
      writeLog('INFO', `渠道已删除: ${id}`)
      res.json(null)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // test_feishu_connection — 真实调用飞书接口获取 app_access_token
  router.post('/test_feishu_connection', async (req, res) => {
    const { app_id, app_secret } = req.body
    if (!app_id || !app_secret) {
      return res.json(false)
    }
    try {
      const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ app_id, app_secret }),
        signal: AbortSignal.timeout(8000),
      })
      const data = await response.json()
      // code === 0 表示成功，有 app_access_token
      const ok = data.code === 0 && !!data.app_access_token
      if (!ok) writeLog('WARN', `飞书连接测试失败: app_id=${app_id}, code=${data.code}`)
      else writeLog('INFO', `飞书连接测试成功: app_id=${app_id}`)
      res.json(ok)
    } catch (err) {
      writeLog('WARN', `飞书连接测试异常: app_id=${app_id}, ${err.message}`)
      res.json(false)
    }
  })

  return router
}

// Backward compatibility
export default createChannelRouter
