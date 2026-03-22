/**
 * E2E 流程测试：创建完整 OPC 团队
 * 覆盖 OPC 创建 → Agent 配置 → 渠道绑定 → 部署流程
 */
import { test, expect, Page, BrowserContext } from '@playwright/test'

test.describe('Create OPC Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test('完整 OPC 创建流程', async ({ page }) => {
    // 1. 导航到 OPC 页面
    await page.goto('/#/opc')
    await page.waitForTimeout(500)

    // 2. 点击创建按钮
    const createButton = page.locator('button:has-text("创建"), button:has-text("新建")').first()
    await createButton.click()
    await page.waitForTimeout(300)

    // 3. 填写 OPC 信息
    const modal = page.locator('[role="dialog"], .modal, .ant-modal')
    await expect(modal).toBeVisible()

    const nameInput = modal.locator('input[placeholder*="名称"], input[aria-label*="名称"]').first()
    await nameInput.fill('test-opc-flow')

    const displayNameInput = modal.locator('input[placeholder*="显示名称"]').first()
    await displayNameInput.fill('Test OPC Flow')

    // 4. 选择头像颜色
    const colorPicker = modal.locator('.color-picker, .avatar-color').first()
    await colorPicker.click()
    await page.waitForTimeout(200)

    // 5. 提交创建
    const submitButton = modal.locator('button:has-text("创建"), button[type="submit"]').first()
    await submitButton.click()
    await page.waitForTimeout(500)

    // 6. 验证创建成功（列表中出现新 OPC）
    await expect(page.locator('text=Test OPC Flow')).toBeVisible({ timeout: 5000 })
  })

  test('Agent 配置流程', async ({ page }) => {
    // 1. 导航到 Agents 页面
    await page.goto('/#/agents')
    await page.waitForTimeout(500)

    // 2. 点击创建 Agent
    const createButton = page.locator('button:has-text("新建"), button:has-text("创建"), .add-button').first()
    await createButton.click()
    await page.waitForTimeout(500)

    // 3. 填写 Agent 信息
    const nameInput = page.locator('input[placeholder*="名称"], input[aria-label*="名称"]').first()
    await nameInput.fill('test-agent')

    const displayNameInput = page.locator('input[placeholder*="显示名称"]').first()
    await displayNameInput.fill('Test Agent')

    // 4. 保存
    const saveButton = page.locator('button:has-text("保存")').first()
    await saveButton.click()
    await page.waitForTimeout(500)

    // 5. 验证创建成功
    await expect(page.locator('text=Test Agent')).toBeVisible({ timeout: 5000 })
  })

  test('渠道配置流程', async ({ page }) => {
    // 1. 导航到 Bindings 页面
    await page.goto('/#/bindings')
    await page.waitForTimeout(500)

    // 2. 选择飞书渠道
    const feishuTab = page.locator('button:has-text("飞书"), .tab:has-text("Feishu")').first()
    await feishuTab.click()
    await page.waitForTimeout(300)

    // 3. 点击配置按钮
    const configButton = page.locator('button:has-text("配置"), button:has-text("编辑")').first()
    await configButton.click()
    await page.waitForTimeout(300)

    // 4. 填写配置（使用测试数据）
    const appIdInput = page.locator('input[placeholder*="App ID"], input[aria-label*="App ID"]').first()
    await appIdInput.fill('cli_test123')

    const appSecretInput = page.locator('input[placeholder*="Secret"], input[type="password"]').first()
    await appSecretInput.fill('test_secret_123')

    // 5. 保存
    const saveButton = page.locator('button:has-text("保存")').first()
    await saveButton.click()
    await page.waitForTimeout(500)

    // 6. 验证配置成功
    await expect(page.locator('text=已配置, text=已连接').first()).toBeVisible({ timeout: 5000 })
  })

  test('部署流程', async ({ page }) => {
    // 1. 导航到 Deploy 页面
    await page.goto('/#/deploy')
    await page.waitForTimeout(500)

    // 2. 选择 OPC
    const opcSelect = page.locator('select, .ant-select').first()
    await opcSelect.click()
    await page.waitForTimeout(300)

    // 3. 选择办公室
    const officeSelect = page.locator('select, .ant-select').nth(1)
    await officeSelect.click()
    await page.waitForTimeout(300)

    // 4. 点击部署
    const deployButton = page.locator('button:has-text("部署"), button:has-text("立即部署")').first()
    await deployButton.click()
    await page.waitForTimeout(500)

    // 5. 验证部署进度显示
    const progressBar = page.locator('.progress, .ant-progress, [role="progressbar"]')
    await expect(progressBar).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Settings Flow', () => {
  test('语言切换持久化', async ({ page, context }) => {
    await page.goto('/#/settings')
    await page.waitForTimeout(500)

    // 1. 切换到英文
    const enButton = page.locator('button:has-text("en")').first()
    await enButton.click()
    await page.waitForTimeout(500)

    // 2. 验证页面切换为英文
    await expect(page.locator('text=Settings')).toBeVisible({ timeout: 3000 })

    // 3. 刷新页面
    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(500)

    // 4. 验证语言保持
    await expect(page.locator('text=Settings')).toBeVisible({ timeout: 3000 })
  })

  test('RTL 布局切换', async ({ page }) => {
    await page.goto('/#/settings')
    await page.waitForTimeout(500)

    // 1. 切换到阿拉伯语
    const arButton = page.locator('button:has-text("ar")').first()
    await arButton.click()
    await page.waitForTimeout(500)

    // 2. 验证 RTL 生效
    const htmlDir = await page.evaluate(() => document.documentElement.getAttribute('dir'))
    expect(htmlDir).toBe('rtl')

    // 3. 验证 RTL 提示显示
    await expect(page.locator('text=RTL')).toBeVisible({ timeout: 3000 })

    // 4. 切换回英文
    const enButton = page.locator('button:has-text("en")').first()
    await enButton.click()
    await page.waitForTimeout(500)

    // 5. 验证恢复 LTR
    const htmlDirAfter = await page.evaluate(() => document.documentElement.getAttribute('dir'))
    expect(htmlDirAfter).toBe('ltr')
  })
})

test.describe('Error Handling', () => {
  test('网络错误处理', async ({ page }) => {
    // Mock 网络错误
    await page.route('**/api/**', route => route.abort('failed'))

    await page.goto('/#/opc')
    await page.waitForTimeout(1000)

    // 应显示错误提示或空状态
    const errorElement = page.locator('text=错误，text=失败，text=Error, text=Failed').first()
    await expect(errorElement).toBeVisible({ timeout: 5000 })
  })

  test('表单验证', async ({ page }) => {
    await page.goto('/#/opc')
    await page.waitForTimeout(500)

    // 点击创建
    const createButton = page.locator('button:has-text("创建"), button:has-text("新建")').first()
    await createButton.click()
    await page.waitForTimeout(300)

    // 不填写直接提交
    const submitButton = page.locator('button:has-text("创建"), button[type="submit"]').first()
    await submitButton.click()
    await page.waitForTimeout(500)

    // 应显示验证错误
    const errorText = page.locator('text=必填，text=请填写，text=required').first()
    await expect(errorText).toBeVisible({ timeout: 3000 })
  })
})
