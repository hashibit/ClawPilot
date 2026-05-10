import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

// hi-fi: navigate by clicking sidebar nav items
await page.goto('http://localhost:7777/ClawPilot.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);

const targets = [
  ['hifi-overview',  '数据概览'],
  ['hifi-companies', '公司列表'],
  ['hifi-providers', '模型管理'],
  ['hifi-office',    '办公室管理'],
  ['hifi-logs',      '运行日志'],
  ['hifi-activities','实时活动'],
  ['hifi-settings',  '设置'],
];

for (const [name, label] of targets) {
  try {
    // click nav item containing the label
    const handle = await page.evaluateHandle((lbl) => {
      const items = Array.from(document.querySelectorAll('.nav-item'));
      return items.find(el => el.textContent.includes(lbl));
    }, label);
    await handle.evaluate(el => el && el.click());
    await page.waitForTimeout(600);
    await page.screenshot({ path: `/tmp/cccombat-screenshots/${name}.png`, fullPage: false });
    console.log(`OK ${name}`);
  } catch (e) {
    console.log(`ERR ${name}: ${e.message.slice(0,80)}`);
  }
}

// Now: enter a company to capture company-scope pages (agents/deploy/bindings)
try {
  // Click "进入公司" or company card
  await page.evaluate(() => {
    // find company card primary button or company-card
    const btns = Array.from(document.querySelectorAll('button, .company-card'));
    const enter = btns.find(b => b.textContent.includes('进入公司') || b.textContent.includes('进入'));
    if (enter) enter.click();
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/cccombat-screenshots/hifi-agents.png', fullPage: false });
  console.log('OK hifi-agents');

  const cTargets = [
    ['hifi-deploy',   '部署'],
    ['hifi-bindings', '渠道'],
  ];
  for (const [name, label] of cTargets) {
    try {
      const h = await page.evaluateHandle((lbl) => {
        const items = Array.from(document.querySelectorAll('.nav-item'));
        return items.find(el => el.textContent.includes(lbl));
      }, label);
      await h.evaluate(el => el && el.click());
      await page.waitForTimeout(500);
      await page.screenshot({ path: `/tmp/cccombat-screenshots/${name}.png`, fullPage: false });
      console.log(`OK ${name}`);
    } catch (e) {
      console.log(`ERR ${name}: ${e.message.slice(0,80)}`);
    }
  }
} catch (e) {
  console.log('Could not enter company: ' + e.message);
}

await browser.close();
