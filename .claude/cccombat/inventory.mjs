// Structural inventory extractor — compares hi-fi vs app on key UI fingerprints
// Run: node .claude/cccombat/inventory.mjs
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const browser = await chromium.launch({ headless: true });

// ===== Inventory extraction (runs in page) =====
const extract = () => {
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const cs = (el, p) => getComputedStyle(el)[p];
  const isFilled = (el) => {
    const bg = cs(el, 'backgroundColor');
    return bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
  };
  const iconCount = (el) => el.querySelectorAll('svg, img, [class*="icon"]').length;
  const btnFingerprint = (el) => ({
    text: el.textContent.trim().slice(0, 16),
    cls: el.className,
    iconCount: iconCount(el),
    filled: isFilled(el),
    bg: cs(el, 'backgroundColor'),
    border: cs(el, 'borderColor'),
    color: cs(el, 'color'),
    variant: /btn-primary/.test(el.className) ? 'primary'
      : /btn-danger/.test(el.className)  ? 'danger'
      : /btn-ghost/.test(el.className)   ? 'ghost'
      : /\bbtn\b/.test(el.className)     ? 'default'
      : /tbtn/.test(el.className)        ? 'tbtn-legacy'
      : 'unknown',
  });

  // ── topbar ──
  const topbar = document.querySelector('.topbar, [class*="topbar"]');
  const topbarReport = topbar ? {
    hasSearchInput: !!topbar.querySelector('input[type="search"], input[placeholder*="搜索"], input[placeholder*="search" i]'),
    hasKbdHint: !!topbar.querySelector('.kbd, kbd'),
    hasSegmentToggle: !!topbar.querySelector('.seg, [class*="segment"], [role="tablist"]'),
    childCount: topbar.children.length,
    text: topbar.textContent.trim().slice(0, 80),
  } : { exists: false };

  // ── sidebar nav ──
  const navItems = $$('.nav-item, [class*="nav-item"]').map(el => {
    const txt = el.textContent.trim();
    const numTokens = txt.match(/\d+\s*$/);
    return {
      text: txt.slice(0, 30),
      hasCountBadge: !!el.querySelector('.count, .badge, [class*="count"]') ||
                      (numTokens && numTokens[0].length <= 4),
      hasIcon: iconCount(el) > 0,
    };
  });

  // ── brand area ──
  const brand = document.querySelector('.brand, .logo-box, [class*="brand"]');
  const brandReport = brand ? {
    text: brand.textContent.trim().slice(0, 30),
    hasGradientLogo: brand.querySelector('[class*="logo"]') !== null,
  } : { exists: false };

  // ── agent strip ──
  const agentPills = $$('.agent-pill, .agent-strip > *').map(el => ({
    text: el.textContent.trim().slice(0, 16),
    cls: el.className,
    isAdd: /add|添加/.test(el.textContent) || /dashed/.test(el.className) || el.className.includes('add'),
    isBatch: /批量|batch/i.test(el.textContent),
    selected: /selected|active/.test(el.className),
    iconCount: iconCount(el),
  }));

  // ── agent toolbar (right-side action buttons) ──
  const tb = document.querySelector('.agent-toolbar');
  const toolbarBtns = tb ? $$(':scope button, :scope a.btn', tb).map(btnFingerprint) : [];

  // ── agent header tag ("领队") ──
  const leaderTag = $$('.tag, [class*="tag"]').find(el => el.textContent.includes('领队'));
  const leaderTagReport = leaderTag ? {
    iconCount: iconCount(leaderTag),
    text: leaderTag.textContent.trim(),
  } : { exists: false };

  // ── detail header buttons (providers / office) ──
  const detailHeaderBtns = $$('.split-detail-head button, .detail-head button, [class*="detail"] [class*="head"] button')
    .map(btnFingerprint);

  return {
    url: location.href,
    hash: location.hash,
    topbar: topbarReport,
    brand: brandReport,
    nav: { count: navItems.length, withCount: navItems.filter(n => n.hasCountBadge).length, items: navItems },
    agentStrip: {
      total: agentPills.length,
      hasAddPill: agentPills.some(p => p.isAdd),
      hasBatchPill: agentPills.some(p => p.isBatch),
    },
    toolbar: { count: toolbarBtns.length, btns: toolbarBtns },
    leaderTag: leaderTagReport,
    detailHeaderBtns,
  };
};

// ===== Run on hi-fi =====
async function snapHifi() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('http://localhost:7777/ClawPilot.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  // hi-fi: scope=global initially. Need to enter company → then nav 智能体管理.
  // Step 1: nav to 公司列表
  await page.evaluate(() => {
    const nav = Array.from(document.querySelectorAll('.nav-item')).find(el => el.textContent.includes('公司列表'));
    if (nav) nav.click();
  });
  await page.waitForTimeout(600);
  // Step 2: click "进入" button on first company-card
  const clickResult = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.company-card'));
    const card = cards[0];
    if (!card) return 'no-card';
    // try a button inside, then any clickable child, then card itself
    const btn = card.querySelector('button, .btn, [class*="enter"], [class*="primary"]');
    if (btn) { btn.click(); return 'clicked-btn:' + btn.className; }
    card.click();
    return 'clicked-card';
  });
  console.error('hifi enter result:', clickResult);
  await page.waitForTimeout(1000);
  // Step 3: nav to 智能体管理 (now in company scope)
  await page.evaluate(() => {
    const nav = Array.from(document.querySelectorAll('.nav-item')).find(el => el.textContent.includes('智能体'));
    if (nav) nav.click();
  });
  await page.waitForTimeout(800);
  const inv = await page.evaluate(extract);
  await ctx.close();
  return inv;
}

// ===== Run on app =====
async function snapApp() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('http://localhost:16666/#/companies', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const enter = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('进入'));
    if (enter) enter.click();
  });
  await page.waitForTimeout(1000);
  await page.evaluate(() => location.hash = '#/agents');
  await page.waitForTimeout(1200);
  const inv = await page.evaluate(extract);
  await ctx.close();
  return inv;
}

const hifi = await snapHifi();
const app = await snapApp();
await browser.close();

const out = { hifi, app };
fs.writeFileSync('.claude/cccombat/inventory-result.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
