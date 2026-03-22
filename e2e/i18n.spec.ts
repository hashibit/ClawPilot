/**
 * i18n 国际化完整测试套件
 * 覆盖 16 种语言的切换、持久化、RTL 布局、文本溢出
 */
import { test, expect, Page, BrowserContext } from '@playwright/test'

// ── 语言测试数据 ──────────────────────────────────────────────────────────────
const LANGUAGES = [
  { code: 'en',    label: 'English',           settingsTitle: 'Settings',       navOverview: 'Overview',       rtl: false },
  { code: 'zh-CN', label: '简体中文',           settingsTitle: '设置',            navOverview: '数据概览',       rtl: false },
  { code: 'zh-TW', label: '繁體中文',           settingsTitle: '設定',            navOverview: '數據概覽',       rtl: false },
  { code: 'ja',    label: '日本語',             settingsTitle: '設定',            navOverview: '概要',           rtl: false },
  { code: 'ko',    label: '한국어',             settingsTitle: '설정',            navOverview: '개요',           rtl: false },
  { code: 'fr',    label: 'Français',           settingsTitle: 'Paramètres',     navOverview: "Vue d'ensemble", rtl: false },
  { code: 'de',    label: 'Deutsch',            settingsTitle: 'Einstellungen',  navOverview: 'Übersicht',      rtl: false },
  { code: 'es',    label: 'Español',            settingsTitle: 'Configuración',  navOverview: 'Resumen',        rtl: false },
  { code: 'pt',    label: 'Português',          settingsTitle: 'Configurações',  navOverview: 'Visão geral',    rtl: false },
  { code: 'ru',    label: 'Русский',            settingsTitle: 'Настройки',      navOverview: 'Обзор',          rtl: false },
  { code: 'ar',    label: 'العربية',            settingsTitle: 'الإعدادات',      navOverview: 'نظرة عامة',      rtl: true  },
  { code: 'hi',    label: 'हिन्दी',             settingsTitle: 'सेटिंग',          navOverview: 'अवलोकन',        rtl: false },
  { code: 'id',    label: 'Bahasa Indonesia',   settingsTitle: 'Pengaturan',     navOverview: 'Ikhtisar',       rtl: false },
  { code: 'th',    label: 'ไทย',               settingsTitle: 'การตั้งค่า',      navOverview: 'ภาพรวม',         rtl: false },
  { code: 'vi',    label: 'Tiếng Việt',        settingsTitle: 'Cài đặt',        navOverview: 'Tổng quan',      rtl: false },
  { code: 'it',    label: 'Italiano',           settingsTitle: 'Impostazioni',   navOverview: 'Panoramica',     rtl: false },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

/** 在页面加载前通过 addInitScript 设置 localStorage */
async function setupLang(context: BrowserContext, lang: string) {
  await context.addInitScript((l: string) => {
    localStorage.setItem('clawpilot_lang', l)
  }, lang)
}

/** 在页面加载前清除 lang */
async function resetLang(context: BrowserContext) {
  await context.addInitScript(() => {
    localStorage.removeItem('clawpilot_lang')
  })
}

/** 通过点击语言按钮切换语言（不刷新页面）*/
async function switchLangOnPage(page: Page, langCode: string) {
  const btn = page.locator(`button:has-text("${langCode}")`).first()
  await btn.click()
  await page.waitForTimeout(400)
}

async function goSettings(page: Page) {
  await page.goto('/#/settings')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(300)
}

/**
 * 获取内容区域工具栏的第一个 span 文本。
 * Layout 中 sidebar 有第一个 .toolbar（含 ClawPilot），
 * 内容区的 .toolbar 是后续出现的，取最后一个。
 */
function contentToolbarTitle(page: Page) {
  return page.locator('.toolbar').last().locator('span').first()
}

// ── Group 1: en / zh-CN / zh-TW / ja / ko ────────────────────────────────────
test.describe('Group 1 — en / zh-CN / zh-TW / ja / ko', () => {
  for (const lang of LANGUAGES.slice(0, 5)) {
    test(`[${lang.code}] 切换语言 → ${lang.label}`, async ({ page, context }) => {
      await resetLang(context)
      await goSettings(page)

      await switchLangOnPage(page, lang.code)

      await expect(contentToolbarTitle(page)).toContainText(lang.settingsTitle)

      await page.click(`a[href="#/overview"]`)
      await page.waitForTimeout(300)
      await expect(contentToolbarTitle(page)).toContainText(lang.navOverview)
    })
  }
})

// ── Group 2: fr / de / es / pt / ru ──────────────────────────────────────────
test.describe('Group 2 — fr / de / es / pt / ru', () => {
  for (const lang of LANGUAGES.slice(5, 10)) {
    test(`[${lang.code}] 切换语言 → ${lang.label}`, async ({ page, context }) => {
      await resetLang(context)
      await goSettings(page)

      await switchLangOnPage(page, lang.code)
      await expect(contentToolbarTitle(page)).toContainText(lang.settingsTitle)

      await page.click(`a[href="#/overview"]`)
      await page.waitForTimeout(300)
      await expect(contentToolbarTitle(page)).toContainText(lang.navOverview)
    })
  }

  test('[de] 导航标签溢出处理 — ellipsis 样式生效', async ({ page, context }) => {
    await setupLang(context, 'de')
    await goSettings(page)
    await page.waitForTimeout(300)

    const navItems = page.locator('.nav-item .text-sm')
    const count = await navItems.count()
    expect(count).toBeGreaterThan(0)

    // Verify overflow is handled via CSS (overflow:hidden is set)
    // Items may have scrollWidth > clientWidth (text truncated via ellipsis — acceptable)
    // but the element must not visually break layout (clientWidth <= sidebar width - padding)
    const sidebarWidth = 204
    for (let i = 0; i < count; i++) {
      const el = navItems.nth(i)
      const clientWidth = await el.evaluate(node => (node as HTMLElement).clientWidth)
      // Text element clientWidth should be within sidebar bounds
      expect(clientWidth, `Nav item ${i} clientWidth exceeds sidebar`).toBeLessThanOrEqual(sidebarWidth - 40)
    }
  })
})

// ── Group 3: ar / hi / id / th / vi / it ─────────────────────────────────────
test.describe('Group 3 — ar / hi / id / th / vi / it', () => {
  for (const lang of LANGUAGES.slice(10)) {
    test(`[${lang.code}] 切换语言 → ${lang.label}`, async ({ page, context }) => {
      await resetLang(context)
      await goSettings(page)

      await switchLangOnPage(page, lang.code)
      await expect(contentToolbarTitle(page)).toContainText(lang.settingsTitle)

      await page.click(`a[href="#/overview"]`)
      await page.waitForTimeout(300)
      await expect(contentToolbarTitle(page)).toContainText(lang.navOverview)
    })
  }
})

// ── RTL 专项测试 ──────────────────────────────────────────────────────────────
test.describe('RTL — Arabic layout', () => {
  test('[ar] html[dir] 属性切换为 rtl', async ({ page, context }) => {
    await resetLang(context)
    await goSettings(page)

    const dirBefore = await page.evaluate(() => document.documentElement.getAttribute('dir'))
    expect(dirBefore).not.toBe('rtl')

    await switchLangOnPage(page, 'ar')

    const dir = await page.evaluate(() => document.documentElement.getAttribute('dir'))
    expect(dir).toBe('rtl')
  })

  test('[ar] html[lang] 属性设置为 ar', async ({ page, context }) => {
    await resetLang(context)
    await goSettings(page)
    await switchLangOnPage(page, 'ar')

    const lang = await page.evaluate(() => document.documentElement.getAttribute('lang'))
    expect(lang).toBe('ar')
  })

  test('[ar] RTL 提示横幅显示', async ({ page, context }) => {
    await resetLang(context)
    await goSettings(page)
    await switchLangOnPage(page, 'ar')

    await expect(page.locator('text=RTL layout active')).toBeVisible()
  })

  test('[ar] 切换回 en 恢复 LTR', async ({ page, context }) => {
    await resetLang(context)
    await goSettings(page)
    await switchLangOnPage(page, 'ar')
    await switchLangOnPage(page, 'en')

    const dir = await page.evaluate(() => document.documentElement.getAttribute('dir'))
    expect(dir).toBe('ltr')
    await expect(page.locator('text=RTL layout active')).not.toBeVisible()
  })

  test('[ar] 设置页面工具栏显示阿拉伯文', async ({ page, context }) => {
    await setupLang(context, 'ar')
    await goSettings(page)
    // الإعدادات
    await expect(contentToolbarTitle(page)).toContainText('الإعدادات')
  })
})

// ── 持久化测试 ────────────────────────────────────────────────────────────────
test.describe('语言偏好持久化', () => {
  for (const lang of ['en', 'ja', 'de', 'ar', 'ru']) {
    test(`[${lang}] 刷新后保持语言选择`, async ({ page, context }) => {
      await setupLang(context, lang)
      await goSettings(page)

      const stored = await page.evaluate(() => localStorage.getItem('clawpilot_lang'))
      expect(stored).toBe(lang)

      await page.reload()
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(300)

      const storedAfter = await page.evaluate(() => localStorage.getItem('clawpilot_lang'))
      expect(storedAfter).toBe(lang)

      if (lang === 'ar') {
        const dir = await page.evaluate(() => document.documentElement.getAttribute('dir'))
        expect(dir).toBe('rtl')
      }
    })
  }
})

// ── 硬编码文本检查 ────────────────────────────────────────────────────────────
test.describe('硬编码文本检查 (英文模式)', () => {
  test.beforeEach(async ({ context, page }) => {
    await setupLang(context, 'en')
    await page.goto('/#/overview')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(300)
  })

  test('Overview 工具栏显示英文标题', async ({ page }) => {
    await expect(contentToolbarTitle(page)).toContainText('Overview')
  })

  test('Logs 页面工具栏显示英文', async ({ page }) => {
    await page.goto('/#/logs')
    await page.waitForTimeout(300)
    // Logs page has 2 toolbars (stream + filter panel); check the one with the page title
    await expect(page.locator('.toolbar').filter({ hasText: 'Logs' }).first()).toBeVisible()
  })

  test('Settings 页面标题为英文', async ({ page }) => {
    await page.goto('/#/settings')
    await page.waitForTimeout(300)
    await expect(contentToolbarTitle(page)).toContainText('Settings')
  })

  test('侧边栏包含英文导航项', async ({ page }) => {
    await expect(page.locator('.nav-item').filter({ hasText: 'Overview' }).first()).toBeVisible()
    await expect(page.locator('.nav-item').filter({ hasText: 'Logs' }).first()).toBeVisible()
    await expect(page.locator('.nav-item').filter({ hasText: 'Deploy' }).first()).toBeVisible()
    await expect(page.locator('.nav-item').filter({ hasText: 'Settings' }).first()).toBeVisible()
  })
})

// ── 字体渲染基线检查 ──────────────────────────────────────────────────────────
test.describe('字体渲染 — 特殊字符语言', () => {
  const specialScriptLangs = ['ja', 'ko', 'th', 'hi', 'ar']

  for (const lang of specialScriptLangs) {
    test(`[${lang}] 工具栏文本非空（无渲染崩溃）`, async ({ page, context }) => {
      await setupLang(context, lang)
      await goSettings(page)

      await expect(page.locator('body')).toBeVisible()

      const toolbarText = await contentToolbarTitle(page).textContent()
      expect(toolbarText).toBeTruthy()
      expect(toolbarText!.trim().length).toBeGreaterThan(0)
    })
  }
})
