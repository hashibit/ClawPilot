// Drill-down: brand DOM + channel count
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true });

async function check(url, setup) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await setup(page);
  const r = await page.evaluate(() => {
    const out = {};
    // brand: report all candidates
    out.brandCandidates = ['.brand', '.logo-box', '[class*="brand"]'].map(sel => {
      const els = Array.from(document.querySelectorAll(sel));
      return { sel, count: els.length, texts: els.slice(0,3).map(e => e.textContent.trim().slice(0,40)) };
    });
    // sidebar: full text of left column
    const side = document.querySelector('.sidebar');
    out.sidebarTopText = side ? side.textContent.trim().slice(0, 100) : null;
    // each nav-item raw HTML to check count
    out.navItemsHTML = Array.from(document.querySelectorAll('.nav-item')).map(el => ({
      text: el.textContent.trim(),
      hasCountChild: !!el.querySelector('.count, .badge'),
      childTags: Array.from(el.children).map(c => c.tagName + '.' + (typeof c.className === 'string' ? c.className : c.className.baseVal || '')),
    }));
    // count for channel
    return out;
  });
  await ctx.close();
  return r;
}

const hifi = await check('http://localhost:7777/ClawPilot.html', async (page) => {
  await page.evaluate(() => { const n=Array.from(document.querySelectorAll('.nav-item')).find(e=>e.textContent.includes('公司列表')); n&&n.click(); });
  await page.waitForTimeout(500);
  await page.evaluate(() => { const c=document.querySelector('.company-card'); if(c){const b=c.querySelector('button,.btn'); (b||c).click();} });
  await page.waitForTimeout(800);
  await page.evaluate(() => { const n=Array.from(document.querySelectorAll('.nav-item')).find(e=>e.textContent.includes('智能体')); n&&n.click(); });
  await page.waitForTimeout(600);
});

const app = await check('http://localhost:16666/#/companies', async (page) => {
  await page.evaluate(() => { const b=Array.from(document.querySelectorAll('button')).find(x=>x.textContent.includes('进入')); b&&b.click(); });
  await page.waitForTimeout(1000);
  await page.evaluate(() => location.hash = '#/agents');
  await page.waitForTimeout(800);
});

await browser.close();
console.log('HIFI', JSON.stringify(hifi, null, 2));
console.log('APP ', JSON.stringify(app, null, 2));
