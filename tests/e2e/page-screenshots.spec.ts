import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const SNAPSHOT_DIR = path.join(process.cwd(), 'snapshots', '20260427');
fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });

test.describe.configure({ mode: 'serial' });

async function wait(ms: number) {
  await new Promise(r => setTimeout(r, ms));
}

async function takeScreenshot(page: any, name: string) {
  const filePath = path.join(SNAPSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  console.log(`  Screenshot: ${name}.png`);
}

async function waitForContent(page: any) {
  await page.waitForSelector('.toolbar, .nav-item, main', { state: 'visible' });
  await wait(800);
}

/** Navigate by clicking sidebar link with exact Chinese text */
async function navBySidebar(page: any, text: string) {
  await page.getByRole('link', { name: text, exact: true }).click();
  await waitForContent(page);
}

/** Click a button by exact text */
async function clickButton(page: any, text: string) {
  await page.getByRole('button', { name: text, exact: true }).click();
  await wait(500);
}

test('screenshots', async ({ page }) => {
  await page.goto('/');
  await waitForContent(page);

  // ── 01. Overview ──
  await navBySidebar(page, '数据概览');
  await takeScreenshot(page, '01-overview');

  // ── 02. Companies ──
  await navBySidebar(page, '公司列表');
  await takeScreenshot(page, '02-companies-list');

  const createBtn = page.getByRole('button', { name: '创建子公司' });
  if (await createBtn.count() > 0) {
    await createBtn.click();
    await wait(500);
    await takeScreenshot(page, '02-companies-create-form');
    await clickButton(page, '取消');
    await wait(300);
  }

  // ── 03. Providers ──
  await navBySidebar(page, '模型管理');
  // First click on a different provider to see list change, then screenshot list
  const providerItems = page.locator('.provider-item, .list-pane .list-row, .nav-item');
  if (await providerItems.count() > 1) {
    // Click second provider to switch selection
    await providerItems.nth(1).click();
    await wait(300);
    // Take screenshot showing selected provider detail
    await takeScreenshot(page, '03-providers-detail');
    // Click back to first provider for list screenshot
    await providerItems.nth(0).click();
    await wait(300);
    await takeScreenshot(page, '03-providers-list');
  } else {
    await takeScreenshot(page, '03-providers-list');
  }

  // ── 04. Office ──
  await navBySidebar(page, '办公室管理');
  await takeScreenshot(page, '04-office-list');

  const firstOffice = page.locator('.office-card, .list-pane .list-row, [class*="card"]').first();
  if (await firstOffice.count() > 0) {
    await firstOffice.click();
    await wait(500);
    await takeScreenshot(page, '04-office-detail');
  }

  // ── 05. Logs ──
  await navBySidebar(page, '运行日志');
  await takeScreenshot(page, '05-logs');

  // ── 06. Activities ──
  await navBySidebar(page, '实时活动');
  await takeScreenshot(page, '06-activities');

  // ── 07. Settings ──
  await navBySidebar(page, '设置');
  await takeScreenshot(page, '07-settings');

  // ── 08-10. Company space: Agents, Bindings, Deploy ──
  // Go back to companies and enter a company to set currentOpc context
  await navBySidebar(page, '公司列表');
  const enterBtn = page.getByRole('button', { name: '进入公司' }).first();
  if (await enterBtn.count() > 0) {
    await enterBtn.click();
    await waitForContent(page);

    // 08. Agents (landed on agents page after entering)
    await takeScreenshot(page, '08-agents-list');

    // Click first agent's "编辑" button to enter edit mode
    const editBtn = page.getByRole('button', { name: '编辑' }).first();
    if (await editBtn.count() > 0) {
      await editBtn.click();
      await wait(800);
      await takeScreenshot(page, '08-agents-selected');

      // Cancel to exit edit mode
      await clickButton(page, '取消');
      await wait(300);
    }

    // 09. Bindings - use company-space sidebar link
    await navBySidebar(page, '渠道端管理');
    await takeScreenshot(page, '09-bindings');

    // 10. Deploy - use company-space sidebar link
    await navBySidebar(page, '一键部署');
    await takeScreenshot(page, '10-deploy');

    // Go back to home
    await clickButton(page, '返回首页');
    await waitForContent(page);
  }
});
