// verify74.js — tablet and phone layout: no sideways scrolling on any tab,
// no iOS zoom-on-focus (text fields 16px+ on touch), touch-size checkboxes,
// Card Designer preview beside the form on iPad landscape, swipeable tab
// row on phones.
const { chromium, devices } = require('playwright');
const http = require('http');
const path = require('path');
const assert = require('assert');
const handler = require('serve-handler');
const ROOT = path.join(__dirname, '..');
const PORT = 8974;
const ok = (m) => console.log('OK   ' + m);
const TABS = ['designer', 'adventure', 'gallery', 'roster', 'print', 'quickref', 'rules-index', 'about'];
(async () => {
  const server = http.createServer((q, s) => handler(q, s, { public: ROOT }));
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  try {
    const DEVS = {
      'iPad Mini': devices['iPad Mini'],
      'iPad Mini landscape': devices['iPad Mini landscape'],
      'iPad Pro 11': devices['iPad Pro 11'],
      'iPad Pro 11 landscape': devices['iPad Pro 11 landscape'],
      'iPhone 14': devices['iPhone 14'],
    };
    for (const [name, d] of Object.entries(DEVS)) {
      const ctx = await browser.newContext({ ...d, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      await page.goto(`http://localhost:${PORT}/index.html`);
      await page.waitForTimeout(400);
      for (const t of TABS) {
        await page.click(`.tab-btn[data-tab="${t}"]`);
        await page.waitForTimeout(200);
        const r = await page.evaluate(() => ({
          sw: document.documentElement.scrollWidth, w: document.documentElement.clientWidth,
          small: [...document.querySelectorAll('input[type=text],input[type=number],select,textarea')].filter(e => e.offsetParent && parseFloat(getComputedStyle(e).fontSize) < 16).map(e => e.id),
          box: [...document.querySelectorAll('input[type=checkbox]')].filter(e => e.offsetParent).every(e => e.getBoundingClientRect().width >= 22),
        }));
        assert(r.sw <= r.w, `${name} / ${t}: page scrolls sideways (${r.sw} > ${r.w})`);
        assert.deepStrictEqual(r.small, [], `${name} / ${t}: text fields under 16px make iOS zoom`);
        assert(r.box, `${name} / ${t}: checkboxes are touch size`);
      }
      if (name === 'iPad Pro 11 landscape' || name === 'iPad Mini landscape') {
        await page.click('.tab-btn[data-tab="designer"]');
        const pos = await page.evaluate(() => {
          const f = document.querySelector('.designer-col-left').getBoundingClientRect();
          const p = document.getElementById('preview-panel').getBoundingClientRect();
          return { side: p.left >= f.right, top: Math.abs(p.top - f.top) < 4 };
        });
        assert(pos.side && pos.top, `${name}: preview sits beside the form`);
      }
      if (name === 'iPhone 14') {
        const nav = await page.evaluate(() => { const n = document.querySelector('nav.tabs'); return { rows: new Set([...n.querySelectorAll('.tab-btn')].map(b => Math.round(b.getBoundingClientRect().top))).size, scroll: n.scrollWidth > n.clientWidth }; });
        assert.strictEqual(nav.rows, 1, 'phone tabs sit on one row');
        assert(nav.scroll, 'phone tab row scrolls sideways');
        await page.click('.tab-btn[data-tab="about"]');
        await page.waitForTimeout(400);
        const vis = await page.evaluate(() => { const n = document.querySelector('nav.tabs').getBoundingClientRect(); const b = document.querySelector('.tab-btn[data-tab="about"]').getBoundingClientRect(); return b.left >= n.left - 1 && b.right <= n.right + 1; });
        assert(vis, 'active tab scrolls into view');
      }
      ok(`${name}: all ${TABS.length} tabs fit, no zoom-on-focus, touch-size checkboxes`);
      await ctx.close();
    }
    // Desktop keeps the original three-column designer and one-row menu.
    const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
    await page.goto(`http://localhost:${PORT}/index.html`);
    const desk = await page.evaluate(() => ({
      cols: getComputedStyle(document.querySelector('.designer-grid')).gridTemplateColumns.split(' ').length,
      sticky: getComputedStyle(document.querySelector('header.topbar')).position,
      font: parseFloat(getComputedStyle(document.getElementById('f-name')).fontSize),
    }));
    assert.strictEqual(desk.cols, 3); assert.strictEqual(desk.sticky, 'sticky'); assert.strictEqual(desk.font, 14);
    ok('desktop layout unchanged (3 columns, sticky header, 14px fields)');
    console.log('verify74: all checks passed');
  } catch (e) { console.error('FAILED:', e); process.exitCode = 1; }
  finally { await browser.close(); server.close(); }
})();
