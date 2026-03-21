import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createTestDb, makeSkill } from '../helpers/db.js'
import { createTestApp } from '../helpers/app.js'

describe('Skill Routes', () => {
  let db, app

  beforeEach(() => {
    db = createTestDb()
    app = createTestApp(db)
  })

  describe('get_skills', () => {
    it('返回技能列表', async () => {
      makeSkill(db, { name: 'skill-1', display_name: 'Skill 1' })
      makeSkill(db, { name: 'skill-2', display_name: 'Skill 2' })

      const res = await request(app).post('/api/get_skills').send({})
      expect(res.status).toBe(200)
      expect(res.body.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('create_skill', () => {
    it('创建新技能', async () => {
      const skillData = {
        name: 'test_skill',
        display_name: 'Test Skill',
        description: 'A test skill'
      }

      const res = await request(app).post('/api/create_skill').send({ skill: skillData })
      expect(res.status).toBe(200)
      expect(typeof res.body).toBe('number')
    })

    it('拒绝空名称', async () => {
      const res = await request(app).post('/api/create_skill').send({
        skill: { name: '', display_name: 'Test' }
      })
      expect(res.status).toBe(400)
    })

    it('拒绝重复名称', async () => {
      makeSkill(db, { name: 'duplicate-skill' })

      const res = await request(app).post('/api/create_skill').send({
        skill: { name: 'duplicate-skill', display_name: 'Duplicate' }
      })
      expect(res.status).toBe(400)
    })
  })

  describe('delete_skill', () => {
    it('删除本地技能', async () => {
      const skill = makeSkill(db, { is_local: 1 })

      const res = await request(app).post('/api/delete_skill').send({ id: skill.id })
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
    })
  })
})
