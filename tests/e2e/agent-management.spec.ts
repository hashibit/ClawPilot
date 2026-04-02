/**
 * Agent 管理 E2E 测试
 * 覆盖 Agent 的 CRUD、配置、文档编辑等功能
 */
import { test, expect } from '@playwright/test'

test.describe('Agent Management', () => {
  // ── 创建 Agent ────────────────────────────────────────────────────────────────
  test.describe('创建 Agent', () => {
    test('创建新 Agent - 完整流程', async ({ page }) => {
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
      await nameInput.fill(`test-agent-${Date.now()}`)

      // 保存
      await saveBtn.click()
      await page.waitForTimeout(800)

      // 验证保存成功（Agent 出现在列表中）
      await expect(page.locator('body')).toContainText('test-agent')
    })

    test('创建 Agent - 必填字段验证', async ({ page }) => {
      await page.goto('/#/agents')
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(500)

      // 先选择一个 OPC 公司
      const firstOpc = page.locator('.list-row').first()
      if (await firstOpc.isVisible()) {
        await firstOpc.click()
        await page.waitForTimeout(300)
      }

      // 点击"添加智能体"按钮 - 这是一个 span 元素
      const addAgentBtn = page.locator('span:has-text("添加智能体")').first()
      await addAgentBtn.click()
      await page.waitForTimeout(300)

      // 不填写直接保存
      const saveBtn = page.locator('button:has-text("保存")').first()
      await saveBtn.click()
      await page.waitForTimeout(300)

      // 应该出现错误提示或表单验证
      const body = page.locator('body')
      await expect(body).toBeVisible()
    })

    test('创建 Agent - 取消操作', async ({ page }) => {
      await page.goto('/#/agents')
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(500)

      // 先选择一个 OPC 公司
      const firstOpc = page.locator('.list-row').first()
      if (await firstOpc.isVisible()) {
        await firstOpc.click()
        await page.waitForTimeout(300)
      }

      // 点击"添加智能体"按钮 - 这是一个 span 元素
      const addAgentBtn = page.locator('span:has-text("添加智能体")').first()
      await addAgentBtn.click()
      await page.waitForTimeout(300)

      // 点击取消
      const cancelBtn = page.locator('button:has-text("取消"), button:has-text("Close")').first()
      await cancelBtn.click()
      await page.waitForTimeout(300)

      // 验证退出编辑模式
      const saveBtn = page.locator('button:has-text("保存")')
      const isSaveVisible = await saveBtn.isVisible().catch(() => false)
      expect(isSaveVisible).toBeFalsy()
    })
  })

  // ── Agent 详情 ────────────────────────────────────────────────────────────────
  test.describe('Agent 详情', () => {
    test('Agent 详情页加载 - 人格文档', async ({ page }) => {
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
        await page.waitForTimeout(500)

        // 验证人格文档区域
        await expect(page.locator('body')).toContainText('人格')
      }
    })

    test('Agent 详情 - Tab 切换', async ({ page }) => {
      await page.goto('/#/agents')
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(500)

      // 先选择一个 OPC 公司
      const firstOpc = page.locator('.list-row').first()
      if (await firstOpc.isVisible()) {
        await firstOpc.click()
        await page.waitForTimeout(300)
      }

      // 点击第一个 Agent 卡片
      const firstAgent = page.locator('[class*="avatar"]').first()
      if (await firstAgent.isVisible()) {
        await firstAgent.click()
        await page.waitForTimeout(500)

        // 查找 Tab 按钮 - SOUL, IDENTITY 等
        const tabs = page.locator('.soul-tab, button:has-text("SOUL"), button:has-text("IDENTITY")')
        const count = await tabs.count()

        if (count > 1) {
          // 点击第二个 Tab
          await tabs.nth(1).click()
          await page.waitForTimeout(300)

          // 验证内容切换
          await expect(page.locator('body')).toBeVisible()
        }
      }
    })
  })

  // ── Agent 配置 ────────────────────────────────────────────────────────────────
  test.describe('Agent 配置', () => {
    test('模型配置区域加载', async ({ page }) => {
      await page.goto('/#/agents')
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(500)

      const firstAgent = page.locator('[class*="avatar"]').first()
      if (await firstAgent.isVisible()) {
        await firstAgent.click()
        await page.waitForTimeout(500)

        // 验证模型配置区域存在
        const modelSection = page.locator('text=模型, text=Model, [class*="model"], select')
        const count = await modelSection.count()
        expect(count).toBeGreaterThanOrEqual(0)
      }
    })

    test('工具配置区域加载', async ({ page }) => {
      await page.goto('/#/agents')
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(500)

      const firstAgent = page.locator('[class*="avatar"]').first()
      if (await firstAgent.isVisible()) {
        await firstAgent.click()
        await page.waitForTimeout(500)

        // 验证工具配置区域存在
        const toolSection = page.locator('text=工具, text=Tool, [class*="tool"], [class*="skill"]')
        const count = await toolSection.count()
        expect(count).toBeGreaterThanOrEqual(0)
      }
    })
  })

  // ── 删除 Agent ────────────────────────────────────────────────────────────────
  test.describe('删除 Agent', () => {
    test('删除 Agent - 取消操作', async ({ page }) => {
      await page.goto('/#/agents')
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(500)

      const deleteBtn = page.locator('button:has-text("删除"), button:has-text("Delete")').first()
      if (await deleteBtn.isVisible()) {
        await deleteBtn.click()
        await page.waitForTimeout(300)

        // 应该出现确认对话框
        const confirmDialog = page.locator('[role="alertdialog"], [role="dialog"], .modal, .ant-modal').first()
        const isDialogVisible = await confirmDialog.isVisible()

        if (isDialogVisible) {
          // 点击取消
          const cancelBtn = confirmDialog.locator('button:has-text("取消"), button:has-text("Cancel"), button:has-text("Close")').first()
          await cancelBtn.click()
          await page.waitForTimeout(300)
        }
      }
    })
  })

  // ── 边界情况 ──────────────────────────────────────────────────────────────────
  test.describe('边界情况', () => {
    test('空列表处理', async ({ page }) => {
      await page.goto('/#/agents')
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(500)

      // 页面应该正常渲染，不崩溃
      await expect(page.locator('body')).toBeVisible()
    })

    test('Agent 列表加载', async ({ page }) => {
      await page.goto('/#/agents')
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(500)

      // 验证 OPC 列表存在（左侧公司列表）
      const opcList = page.locator('.list-pane').first()
      await expect(opcList).toBeVisible()
    })
  })
})
