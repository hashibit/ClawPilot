import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto('http://localhost:7777/ClawPilot.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);

// Click 公司列表 then enter a company
await page.evaluate(() => {
  const items = Array.from(document.querySelectorAll('.nav-item'));
  const i = items.find(el => el.textContent.includes('公司列表'));
  if (i) i.click();
});
await page.waitForTimeout(700);

await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button, .btn'));
  const e = btns.find(b => b.textContent.trim().startsWith('进入公司'));
  if (e) e.click();
});
await page.waitForTimeout(900);
await page.screenshot({ path: '/tmp/cccombat-screenshots/hifi-agents.png' });
console.log('OK hifi-agents (company scope)');

const cmap = [
  ['hifi-deploy',   '部署'],
  ['hifi-bindings', '渠道'],
];
for (const [name, label] of cmap) {
  try {
    const ok = await page.evaluate((lbl) => {
      const items = Array.from(document.querySelectorAll('.nav-item'));
      const i = items.find(el => el.textContent.includes(lbl));
      if (i) { i.click(); return true; }
      return false;
    }, label);
    if (!ok) { console.log('NAV NOT FOUND ' + name); continue; }
    await page.waitForTimeout(700);
    await page.screenshot({ path: `/tmp/cccombat-screenshots/${name}.png` });
    console.log('OK ' + name);
  } catch (e) { console.log('ERR ' + name + ' ' + e.message.slice(0,80)); }
}

await browser.close();
