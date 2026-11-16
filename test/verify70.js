// verify70.js — About page feedback section uses the skirmishgames.app@gmail.com address, not GitHub.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const handler = require('serve-handler');
const assert = require('assert');
const PORT = 8870;
const ROOT = path.join(__dirname, '..');
function ok(label) { console.log('OK  ', label); }
(async () => {
  const server = http.createServer((req, res) => handler(req, res, { public: ROOT }));
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  page.on('pageerror', err => { console.error('PAGE ERROR:', err); process.exitCode = 1; });
  await page.goto(`http://localhost:${PORT}/index.html`);
  await page.click('.tab-btn[data-tab="about"]');
  const hrefs = await page.$$eval('#tab-about a', as => as.map(a => a.getAttribute('href')));
  assert(!hrefs.some(h => /github\.com/.test(h)), 'no GitHub links on the About page');
  assert(hrefs.some(h => h.startsWith('mailto:skirmishgames.app@gmail.com')), 'mailto link to skirmishgames.app@gmail.com');
  const text = await page.textContent('#tab-about');
  assert(!/GitHub/i.test(text), 'About text does not mention GitHub');
  assert(text.includes('skirmishgames.app@gmail.com'), 'address shown as text');
  assert(hrefs.includes('https://www.pulpalley.com/'), 'Pulp Alley link kept');
  ok('About page feedback uses skirmishgames.app@gmail.com and has no GitHub links');
  await browser.close(); server.close();
  console.log('verify70: all checks passed');
})().catch(e => { console.error(e); process.exit(1); });
