import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto('http://localhost:16666/', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

// global pages
const globals = [
  ['app-overview',   '/'],
  ['app-companies',  '/#/companies'],
  ['app-providers',  '/#/providers'],
  ['app-office',     '/#/office'],
  ['app-logs',       '/#/logs'],
  ['app-activities', '/#/activities'],
  ['app-settings',   '/#/settings'],
];
for (const [name, path] of globals) {
  try {
    await page.goto('http://localhost:16666' + path, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `/tmp/cccombat-screenshots/${name}.png`, fullPage: false });
    console.log(`OK ${name}`);
  } catch (e) {
    console.log(`ERR ${name}: ${e.message.slice(0,80)}`);
  }
}

// Enter a company to get agents/deploy/bindings
await page.goto('http://localhost:16666/#/companies', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const enterClicked = await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button'));
  const enter = btns.find(b => b.textContent.includes('进入'));
  if (enter) { enter.click(); return true; }
  return false;
});
console.log('enterClicked=' + enterClicked);
await page.waitForTimeout(1000);
await page.screenshot({ path: '/tmp/cccombat-screenshots/app-agents.png', fullPage: false });

// extract current URL hash to derive company slug
const hash = await page.evaluate(() => location.hash);
console.log('after enter hash=' + hash);
const m = hash.match(/#\/c\/([^/]+)/);
if (m) {
  const slug = m[1];
  for (const [name, sub] of [
    ['app-deploy',   '/deploy'],
    ['app-bindings', '/bindings'],
  ]) {
    try {
      await page.goto(`http://localhost:16666/#/c/${slug}${sub}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(700);
      await page.screenshot({ path: `/tmp/cccombat-screenshots/${name}.png`, fullPage: false });
      console.log(`OK ${name}`);
    } catch (e) { console.log(`ERR ${name}: ${e.message.slice(0,80)}`); }
  }
}

await browser.close();
