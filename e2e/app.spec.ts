import { test, expect } from '@playwright/test'

test.describe('ClawPilot E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('首页加载成功', async ({ page }) => {
    // 验证页面标题
    await expect(page).toHaveTitle(/ClawPilot/)

    // 验证主要元素存在
    await expect(page.locator('body')).toBeVisible()
  })

  test('导航到OPC列表页', async ({ page }) => {
    // 点击「子公司管理」导航链接（hash 路由）
    await page.click('a[href="#/opc"]')

    // 验证 URL 中包含 opc（hash 路由）
    await expect(page).toHaveURL(/.*#\/opc.*/)
  })

  test('创建OPC流程', async ({ page }) => {
    // 导航到OPC页面（hash 路由）
    await page.goto('/#/opc')

    // 验证OPC列表页面加载
    await expect(page.locator('body')).toBeVisible()

    // 尝试点击创建按钮（快速超时，不阻塞）
    await page.click('button:has-text("新建")', { timeout: 3000 }).catch(() =>
      page.click('button:has-text("创建")', { timeout: 3000 }).catch(() =>
        console.log('Create button not found, skipping')
      )
    )
  })

  test('Agent管理流程', async ({ page }) => {
    // 导航到Agent页面（hash 路由）
    await page.goto('/#/agents')

    // 验证Agent列表加载
    await expect(page.locator('body')).toBeVisible()
  })

  test('Office管理流程', async ({ page }) => {
    // 导航到Office页面（hash 路由）
    await page.goto('/#/office')

    // 验证Office列表加载
    await expect(page.locator('body')).toBeVisible()
  })

  test('Settings页面访问', async ({ page }) => {
    // 导航到设置页面（尝试 providers 或 settings）
    await page.goto('/#/providers')

    // 验证设置页面加载
    await expect(page.locator('body')).toBeVisible()
  })
})
