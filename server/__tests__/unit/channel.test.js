import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createTestDb, makeOpc, makeChannel } from '../helpers/db.js'
import { createTestApp } from '../helpers/app.js'

describe('Channel Routes', () => {
  let db, app, opc

  beforeEach(() => {
    db = createTestDb()
    app = createTestApp(db)
    opc = makeOpc(db)
  })

  describe('get_channels', () => {
    it('返回空数组（无Channel）', async () => {
      const res = await request(app).post('/api/get_channels').send({ opc_id: opc.id })
      expect(res.status).toBe(200)
      expect(res.body).toEqual([])
    })

    it('返回OPC下的所有Channel', async () => {
      makeChannel(db, opc.id, { channel_type: 'FEISHU' })
      makeChannel(db, opc.id, { channel_type: 'DINGTALK' })

      const res = await request(app).post('/api/get_channels').send({ opc_id: opc.id })
      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(2)
    })
  })

  describe('upsert_channel', () => {
    it('创建飞书Channel', async () => {
      const channelData = {
        opc_id: opc.id,
        channel_type: 'FEISHU',
        is_enabled: 1,
        feishu_config: { app_id: 'test-app', app_secret: 'test-secret' }
      }

      const res = await request(app).post('/api/upsert_channel').send({ config: channelData })
      expect(res.status).toBe(200)

      const getRes = await request(app).post('/api/get_channels').send({ opc_id: opc.id })
      expect(getRes.body).toHaveLength(1)
      expect(getRes.body[0].channel_type).toBe('FEISHU')
    })

    it('创建钉钉Channel', async () => {
      const channelData = {
        opc_id: opc.id,
        channel_type: 'DINGTALK',
        is_enabled: 1,
        dingtalk_config: { app_key: 'test-key' }
      }

      const res = await request(app).post('/api/upsert_channel').send({ config: channelData })
      expect(res.status).toBe(200)
    })

    it('创建Slack Channel', async () => {
      const channelData = {
        opc_id: opc.id,
        channel_type: 'SLACK',
        is_enabled: 1,
        slack_config: { bot_token: 'xoxb-test' }
      }

      const res = await request(app).post('/api/upsert_channel').send({ config: channelData })
      expect(res.status).toBe(200)
    })

    it('更新Channel配置', async () => {
      const channel = makeChannel(db, opc.id, { is_enabled: 1 })

      const res = await request(app).post('/api/upsert_channel').send({
        config: {
          id: channel.id,
          opc_id: opc.id,
          channel_type: 'FEISHU',
          is_enabled: 0,
          feishu_config: null,
          dingtalk_config: null,
          slack_config: null,
          is_connected: 0,
          last_connected: null
        }
      })
      expect(res.status).toBe(200)

      const getRes = await request(app).post('/api/get_channels').send({ opc_id: opc.id })
      expect(getRes.body[0].is_enabled).toBe(false)
    })
  })

  describe('delete_channel', () => {
    it('删除Channel', async () => {
      const channel = makeChannel(db, opc.id)

      const res = await request(app).post('/api/delete_channel').send({ id: channel.id })
      expect(res.status).toBe(200)

      const getRes = await request(app).post('/api/get_channels').send({ opc_id: opc.id })
      expect(getRes.body).toHaveLength(0)
    })
  })
})
