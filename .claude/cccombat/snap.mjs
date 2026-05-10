import { chromium } from '@playwright/test';

const PAGES = [
  // hi-fi
  ['hifi-overview',     'http://localhost:7777/ClawPilot.html'],
  // current app
  ['app-overview',      'http://localhost:16666/'],
  ['app-companies',     'http://localhost:16666/#/companies'],
  ['app-logs',          'http://localhost:16666/#/logs'],
  ['app-activities',    'http://localhost:16666/#/activities'],
  ['app-settings',      'http://localhost:16666/#/settings'],
];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

for (const [name, url] of PAGES) {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `/tmp/cccombat-screenshots/${name}.png`, fullPage: false });
    console.log(`OK ${name}: ${url}`);
  } catch (e) {
    console.log(`ERR ${name}: ${e.message.slice(0, 100)}`);
  }
}
await browser.close();
