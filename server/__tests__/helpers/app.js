import request from 'supertest'
import { createApp } from '../../index.js'

export function createTestApp(db) {
  return createApp(db)
}

// 便捷方法：发起 POST /api/<cmd> 请求
export function apiPost(app, cmd, body = {}) {
  return request(app).post(`/api/${cmd}`).send(body)
}

// 便捷方法：发起 GET 请求
export function apiGet(app, path) {
  return request(app).get(path)
}
