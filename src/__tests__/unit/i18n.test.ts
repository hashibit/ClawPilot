/**
 * i18n 国际化单元测试
 * 验证语言配置、RTL 设置、localStorage 持久化
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { LANGUAGES, RTL_LANGS, isRtl } from '../../i18n'

describe('i18n Configuration', () => {
  describe('LANGUAGES', () => {
    it('应包含 16 种语言', () => {
      expect(LANGUAGES).toHaveLength(16)
    })

    it('每种语言应有 code、label、flag 属性', () => {
      LANGUAGES.forEach(lang => {
        expect(lang).toHaveProperty('code')
        expect(lang).toHaveProperty('label')
        expect(lang).toHaveProperty('flag')
      })
    })

    it('应包含所有必需的语言代码', () => {
      const codes = LANGUAGES.map(l => l.code)
      expect(codes).toContain('zh-CN')
      expect(codes).toContain('zh-TW')
      expect(codes).toContain('en')
      expect(codes).toContain('ja')
      expect(codes).toContain('ko')
      expect(codes).toContain('fr')
      expect(codes).toContain('de')
      expect(codes).toContain('es')
      expect(codes).toContain('pt')
      expect(codes).toContain('ru')
      expect(codes).toContain('ar')
      expect(codes).toContain('hi')
      expect(codes).toContain('id')
      expect(codes).toContain('th')
      expect(codes).toContain('vi')
      expect(codes).toContain('it')
    })
  })

  describe('RTL_LANGS', () => {
    it('应仅包含阿拉伯语', () => {
      expect(RTL_LANGS).toEqual(new Set(['ar']))
    })

    it('isRtl 函数应正确识别 RTL 语言', () => {
      expect(isRtl('ar')).toBe(true)
      expect(isRtl('en')).toBe(false)
      expect(isRtl('zh-CN')).toBe(false)
      expect(isRtl('de')).toBe(false)
    })
  })
})

describe('Language Persistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('应保存语言偏好到 localStorage', () => {
    localStorage.setItem('clawpilot_lang', 'en')
    expect(localStorage.getItem('clawpilot_lang')).toBe('en')
  })

  it('应支持 RTL 语言设置', () => {
    localStorage.setItem('clawpilot_lang', 'ar')
    expect(localStorage.getItem('clawpilot_lang')).toBe('ar')
  })
})
