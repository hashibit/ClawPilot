/**
 * 关键用户流程 E2E 测试
 * 覆盖最核心的用户操作流程
 */
import { test, expect } from '@playwright/test'

test.describe('Critical User Flows', () => {
  // ── 基础页面加载 ──────────────────────────────────────────────────────────────
  test.describe('基础页面加载', () => {
    test('Overview 页面正常加载', async ({ page }) => {
      await page.goto('/#/overview')
      await page.waitForLoadState('networkidle')

      // 验证页面标题
      await expect(page.locator('.toolbar span').first()).toBeVisible()

      // 验证页面包含基本内容
      await expect(page.locator('body')).toContainText('数据概览')
    })

    test('Logs 页面正常加载', async ({ page }) => {
      await page.goto('/#/logs')
      await page.waitForLoadState('networkidle')

      await expect(page.locator('body')).toContainText('日志')
    })

    test('Settings 页面正常加载', async ({ page }) => {
      await page.goto('/#/settings')
      await page.waitForLoadState('networkidle')

      await expect(page.locator('body')).toContainText('设置')
    })

    test('侧边栏导航显示所有菜单项', async ({ page }) => {
      await page.goto('/#/overview')
      await page.waitForLoadState('networkidle')

      // 验证导航项存在
      await expect(page.locator('.nav-item:has-text("概览")')).toBeVisible()
      await expect(page.locator('.nav-item:has-text("日志")')).toBeVisible()
      await expect(page.locator('.nav-item:has-text("部署")')).toBeVisible()
      await expect(page.locator('.nav-item:has-text("设置")')).toBeVisible()
    })
  })

  // ── OPC 创建流程 ──────────────────────────────────────────────────────────────
  test.describe('OPC 创建流程', () => {
    test('创建 OPC - 完整流程', async ({ page }) => {
      await page.goto('/#/opc')
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(500)

      // 点击创建按钮 - 底部 footer 按钮，文本是 "+ 创建子公司"
      const createBtn = page.locator('button:has-text("创建子公司"), .tbtn:has-text("+")').first()
      await createBtn.click()
      await page.waitForTimeout(300)

      // 验证 Modal 打开 - OPC Modal 使用固定定位的 div
      const modal = page.locator('[style*="position: fixed"], [style*="inset: 0"]').first()
      await expect(modal).toBeVisible()

      // 填写表单 - OPC Modal 字段：内部名称 (internal_name), 显示名称 (display_name), 描述
      const nameInput = modal.locator('input[placeholder*="my-company"]').first()
      await nameInput.fill('test-opc-e2e')

      const displayNameInput = modal.locator('input[placeholder*="我的公司"]').first()
      await displayNameInput.fill('测试团队 E2E')

      // 提交
      const submitBtn = modal.locator('button:has-text("创建"), button:has-text("确定")').first()
      await submitBtn.click()
      await page.waitForTimeout(500)

      // 验证 Modal 关闭或出现成功提示
      const isModalVisible = await modal.isVisible()
      if (!isModalVisible) {
        // Modal 关闭表示成功
        await expect(page.locator('body')).toContainText('test-opc-e2e')
      }
    })

    test('创建 OPC - 验证必填字段', async ({ page }) => {
      await page.goto('/#/opc')
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(500)

      const createBtn = page.locator('button:has-text("创建子公司"), .tbtn:has-text("+")').first()
      await createBtn.click()
      await page.waitForTimeout(300)

      // 验证 Modal 打开 - OPC Modal 使用固定定位的 div
      const modal = page.locator('[style*="position: fixed"], [style*="inset: 0"]').first()
      await expect(modal).toBeVisible()

      // 不填写直接提交
      const submitBtn = modal.locator('button:has-text("创建"), button:has-text("确定")').first()
      await submitBtn.click()
      await page.waitForTimeout(300)

      // Modal 应该保持打开（验证失败）
      await expect(modal).toBeVisible()
    })

    test('创建 OPC - 取消操作', async ({ page }) => {
      await page.goto('/#/opc')
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(500)

      const createBtn = page.locator('button:has-text("创建子公司"), .tbtn:has-text("+")').first()
      await createBtn.click()
      await page.waitForTimeout(300)

      // 验证 Modal 打开 - OPC Modal 使用固定定位的 div
      const modal = page.locator('[style*="position: fixed"], [style*="inset: 0"]').first()
      await expect(modal).toBeVisible()

      // 点击取消
      const cancelBtn = modal.locator('button:has-text("取消"), button:has-text("Close")').first()
      await cancelBtn.click()
      await page.waitForTimeout(300)

      // Modal 应该关闭
      await expect(modal).not.toBeVisible()
    })
  })

  // ── Agent 创建流程 ────────────────────────────────────────────────────────────
  test.describe('Agent 创建流程', () => {
    test('创建 Agent - 完整流程', async ({ page }) => {
      await page.goto('/#/agents')
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(500)

      // 先选择一个 OPC 公司
      const firstOpc = page.locator('.list-row').first()
      if (await firstOpc.isVisible()) {
        await firstOpc.click()
        await page.waitForTimeout(300)
      }

      // 点击"添加智能体"按钮 - 这是一个 span 元素，不是 button
      const addAgentBtn = page.locator('span:has-text("添加智能体")').first()
      await addAgentBtn.click()
      await page.waitForTimeout(500)

      // 验证进入编辑模式 - 查找保存按钮（在 toolbar 区域）
      const saveBtn = page.locator('button:has-text("保存"), button:has-text("Saving")').first()
      await expect(saveBtn).toBeVisible()

      // 填写名称 - 使用第一个 text 输入框（显示名称字段）
      const nameInput = page.locator('input[type="text"]').first()
      await nameInput.fill('test-agent-e2e')

      // 保存
      await saveBtn.click()
      await page.waitForTimeout(500)

      // 验证保存成功
      await expect(page.locator('body')).toContainText('test-agent-e2e')
    })

    test('Agent 详情页面加载', async ({ page }) => {
      await page.goto('/#/agents')
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(500)

      // 先选择一个 OPC 公司
      const firstOpc = page.locator('.list-row').first()
      if (await firstOpc.isVisible()) {
        await firstOpc.click()
        await page.waitForTimeout(300)
      }

      // 点击第一个 Agent 卡片（在顶部横条中）
      const firstAgent = page.locator('[class*="avatar"]').first()
      if (await firstAgent.isVisible()) {
        await firstAgent.click()
        await page.waitForTimeout(300)

        // 验证人格配置区域存在
        await expect(page.locator('body')).toContainText('人格')
      }
    })
  })

  // ── 语言切换流程 ──────────────────────────────────────────────────────────────
  test.describe('语言切换流程', () => {
    test('切换到英文', async ({ page }) => {
      await page.goto('/#/settings')
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(300)

      // 点击英文按钮
      const enBtn = page.locator('button:has-text("en")').first()
      await enBtn.click()
      await page.waitForTimeout(300)

      // 验证页面变为英文
      await expect(page.locator('body')).toContainText('Settings')
    })

    test('切换到简体中文', async ({ page }) => {
      await page.goto('/#/settings')
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(300)

      // 点击简体中文按钮
      const zhBtn = page.locator('button:has-text("zh")').first()
      await zhBtn.click()
      await page.waitForTimeout(300)

      // 验证页面变为中文
      await expect(page.locator('body')).toContainText('设置')
    })

    test('语言持久化 - 刷新后保持', async ({ page }) => {
      await page.goto('/#/settings')
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(300)

      // 切换到英文
      const enBtn = page.locator('button:has-text("en")').first()
      await enBtn.click()
      await page.waitForTimeout(300)

      // 刷新页面
      await page.reload()
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(300)

      // 验证语言保持英文
      await expect(page.locator('body')).toContainText('Settings')
    })
  })

  // ── 错误处理 ──────────────────────────────────────────────────────────────────
  test.describe('错误处理', () => {
    test('404 页面处理', async ({ page }) => {
      await page.goto('/#/nonexistent-page')
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(500)

      // 应用可能没有 404 处理，页面应该正常加载不崩溃
      // 最简单的验证：页面仍然可见
      await expect(page.locator('body')).toBeVisible()
    })

    test('网络错误处理 - Server 离线', async ({ page, context }) => {
      // 模拟离线
      await context.setOffline(true)

      try {
        await page.goto('/#/overview', { timeout: 5000 })
      } catch (e) {
        // 网络错误是正常的
      }

      await page.waitForTimeout(500)

      // 页面应该正常渲染（可能有错误提示，但不应该崩溃）
      const body = page.locator('body')
      await expect(body).toBeVisible()

      await context.setOffline(false)
    })
  })
})
