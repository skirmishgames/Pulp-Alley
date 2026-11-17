// verify73.js — Print Sheet offers the binder dividers PDF as a download.
const { chromium } = require('playwright');
const http = require('http');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const handler = require('serve-handler');
const ROOT = path.join(__dirname, '..');
const PORT = 8973;
const ok = (m) => console.log('OK   ' + m);
(async () => {
  const server = http.createServer((q, s) => handler(q, s, { public: ROOT }));
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  try {
    const page = await (await browser.newContext({ acceptDownloads: true })).newPage();
    await page.goto(`http://localhost:${PORT}/index.html`);
    await page.click('.tab-btn[data-tab="print"]');
    assert(await page.isVisible('#print-dividers'), 'dividers link visible on Print Sheet');
    const href = await page.getAttribute('#print-dividers', 'href');
    const file = path.join(ROOT, href);
    assert(fs.existsSync(file), 'PDF exists in the repo');
    assert.strictEqual(fs.readFileSync(file).slice(0, 5).toString(), '%PDF-', 'file is a PDF');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#print-dividers')]);
    assert.strictEqual(dl.suggestedFilename(), 'Pulp-Alley-Binder-Dividers.pdf');
    ok('Print Sheet has a working "Binder dividers (PDF)" download');
    console.log('verify73: all checks passed');
  } catch (e) { console.error('FAILED:', e); process.exitCode = 1; }
  finally { await browser.close(); server.close(); }
})();
