import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto('http://localhost:16666/#/companies', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button'));
  const enter = btns.find(b => b.textContent.includes('进入'));
  if (enter) enter.click();
});
await page.waitForTimeout(1000);

// Go to agents
await page.evaluate(() => location.hash = '#/agents');
await page.waitForTimeout(1200);

const result = await page.evaluate(() => {
  const tb = document.querySelector('.agent-toolbar');
  if (!tb) return { ok: false, reason: 'no .agent-toolbar' };
  const btns = Array.from(tb.querySelectorAll('button'));
  const tbRect = tb.getBoundingClientRect();
  return {
    ok: true,
    toolbar: { x: tbRect.x, y: tbRect.y, w: tbRect.width, h: tbRect.height },
    buttonCount: btns.length,
    buttons: btns.map(b => {
      const r = b.getBoundingClientRect();
      const cs = getComputedStyle(b);
      return {
        text: b.textContent.trim().slice(0, 20),
        x: r.x, y: r.y, w: r.width, h: r.height,
        visible: r.width > 0 && r.height > 0,
        bg: cs.backgroundColor,
        border: cs.border,
        color: cs.color,
        display: cs.display,
      };
    })
  };
});

console.log(JSON.stringify(result, null, 2));

// Also check providers btns
await page.evaluate(() => location.hash = '#/providers');
await page.waitForTimeout(1000);
const provResult = await page.evaluate(() => {
  // try to find buttons in detail header
  const btns = Array.from(document.querySelectorAll('button.btn'));
  return {
    totalBtnCount: btns.length,
    samples: btns.slice(0, 6).map(b => {
      const cs = getComputedStyle(b);
      const r = b.getBoundingClientRect();
      return {
        text: b.textContent.trim().slice(0, 20),
        cls: b.className,
        bg: cs.backgroundColor,
        borderColor: cs.borderColor,
        borderWidth: cs.borderWidth,
        color: cs.color,
        w: r.width, h: r.height,
      };
    })
  };
});
console.log('PROVIDERS:', JSON.stringify(provResult, null, 2));

await browser.close();
