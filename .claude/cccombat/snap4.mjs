import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

// must enter company first via UI; then routes are flat
await page.goto('http://localhost:16666/#/companies', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button'));
  const enter = btns.find(b => b.textContent.includes('进入'));
  if (enter) enter.click();
});
await page.waitForTimeout(1000);
console.log('after enter hash=' + await page.evaluate(() => location.hash));

for (const [name, hash] of [
  ['app-agents',   '#/agents'],
  ['app-deploy',   '#/deploy'],
  ['app-bindings', '#/bindings'],
]) {
  try {
    await page.evaluate(h => location.hash = h, hash);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `/tmp/cccombat-screenshots/${name}.png`, fullPage: false });
    console.log('OK ' + name);
  } catch (e) { console.log('ERR ' + name + ' ' + e.message.slice(0,80)); }
}

await browser.close();
