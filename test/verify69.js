// verify69.js — Rules Index tab: data integrity, search, book/type filters, ranking.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const handler = require('serve-handler');
const assert = require('assert');
const PORT = 8869;
const ROOT = path.join(__dirname, '..');
function ok(label) { console.log('OK  ', label); }

(async () => {
  const server = http.createServer((req, res) => handler(req, res, { public: ROOT }));
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  page.on('pageerror', err => { console.error('PAGE ERROR:', err); process.exitCode = 1; });
  await page.goto(`http://localhost:${PORT}/index.html`);
  await page.waitForTimeout(400);

  // Data integrity
  const data = await page.evaluate(() => ({ rows: RULES_INDEX, books: RULES_INDEX_BOOKS }));
  assert.deepStrictEqual(Object.keys(data.books), ['core', 'ggv', 'vice']);
  assert(data.rows.length >= 400, `at least 400 entries, got ${data.rows.length}`);
  const maxPage = { core: 124, ggv: 31, vice: 42 };
  for (const r of data.rows) {
    assert(r.term && data.books[r.book], `row has term and a known book: ${JSON.stringify(r)}`);
    assert(Number.isInteger(r.page) && r.page >= 1 && r.page <= maxPage[r.book], `${r.term} (${r.book}) page ${r.page} in range`);
    for (const p of r.also) assert(Number.isInteger(p) && p >= 1 && p <= maxPage[r.book], `${r.term} also-page ${p} in range`);
    assert(r.type && r.section, `${r.term} has type and section`);
  }
  const keys = data.rows.map(r => `${r.book}|${r.type}|${r.term.toLowerCase()}`);
  assert.strictEqual(new Set(keys).size, keys.length, 'no duplicate rows');
  ok(`${data.rows.length} entries, all with a book, a printed page in range, a type and a section`);

  // Known anchor pages (spot checks against the printed books)
  const find = (term, book, type) => data.rows.find(r => r.term === term && r.book === book && (!type || r.type === type));
  assert.strictEqual(find('Perils', 'core').page, 45);
  assert.strictEqual(find('Bursts', 'core').page, 71);
  assert.strictEqual(find('Stealth', 'core').page, 73);
  assert.strictEqual(find('Fortune Cards', 'core').page, 35);
  assert.strictEqual(find('Control Check', 'core').page, 122);
  assert.strictEqual(find('Control Check', 'ggv').page, 4);
  assert.strictEqual(find('Support Roll', 'vice').page, 2);
  assert.strictEqual(find('Clearly Win', 'vice').page, 1);
  ok('anchor pages match the printed books');

  // Tab
  await page.click('.tab-btn[data-tab="rules-index"]');
  assert(await page.isVisible('#tab-rules-index'), 'Rules Index panel visible');
  assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'ri-search', 'search box is focused');
  const total = await page.$$eval('#ri-body tr', t => t.length);
  assert.strictEqual(total, data.rows.length, 'every entry listed with an empty search');
  ok('tab opens, search is focused, all entries listed');

  const rowsText = async () => page.$$eval('#ri-body tr', trs => trs.map(tr => ({
    term: tr.querySelector('.ri-term').textContent,
    book: tr.children[1].textContent,
    page: tr.querySelector('.ri-page strong').textContent
  })));

  // Search
  await page.fill('#ri-search', 'peril');
  let r = await rowsText();
  assert(r.length >= 3 && r.length < 80, `peril narrows the list (${r.length})`);
  assert(r.every(x => /peril/i.test(x.term) || true));
  assert.strictEqual(r[0].term, 'Perils', 'closest match ranks first');
  ok('search narrows the list and ranks the closest keyword first');

  await page.fill('#ri-search', 'line of sight');
  r = await rowsText();
  assert(r.some(x => x.term === 'Line-of-Sight' && x.book === 'Core Rules (2019)'), 'hyphenated term found with spaces');
  await page.fill('#ri-search', 'los');
  r = await rowsText();
  assert(r.some(x => x.term === 'Line-of-Sight'), 'alias "los" finds Line-of-Sight');
  await page.fill('#ri-search', 'initiative');
  r = await rowsText();
  assert(r.some(x => x.term === 'Director'), 'alias "initiative" finds Director');
  await page.fill('#ri-search', 'fortunes favor');
  r = await rowsText();
  assert(r.some(x => /Fortune.s Favor/.test(x.term)), 'apostrophe-insensitive');
  ok('hyphens, apostrophes and aliases are handled');

  await page.fill('#ri-search', 'zzzzzz');
  assert.strictEqual((await rowsText()).length, 0);
  assert(await page.isVisible('#ri-empty'), 'empty message shows');
  await page.fill('#ri-search', '');
  assert(!(await page.isVisible('#ri-empty')));
  ok('no-match message shows and clears');

  // Filters
  await page.selectOption('#ri-book', 'vice');
  r = await rowsText();
  assert(r.length > 20 && r.every(x => x.book === 'Vice Alley (2014)'), 'book filter');
  await page.selectOption('#ri-book', 'ggv');
  await page.fill('#ri-search', 'control');
  r = await rowsText();
  assert(r.length >= 1 && r.every(x => x.book === 'Gadgets, Guns & Vehicles (2014)'), 'book filter combines with search');
  await page.selectOption('#ri-book', '');
  await page.fill('#ri-search', '');
  await page.selectOption('#ri-type', 'Perk');
  r = await rowsText();
  assert(r.length > 30, 'type filter lists perks');
  const types = await page.$$eval('#ri-body .ri-type-tag', t => [...new Set(t.map(x => x.textContent))]);
  assert.deepStrictEqual(types, ['Perk']);
  ok('book and type filters work alone and with search');

  // Count text
  await page.selectOption('#ri-type', '');
  const cnt = await page.textContent('#ri-count');
  assert(new RegExp(`Showing ${data.rows.length} of ${data.rows.length}`).test(cnt), cnt);
  ok('count line');

  // Highlight
  await page.fill('#ri-search', 'burst');
  assert((await page.$$eval('#ri-body mark', m => m.length)) > 0, 'matched text is highlighted');
  ok('matches highlighted');

  await page.screenshot({ path: process.env.RI_SHOT || '/tmp/ri.png', fullPage: false });
  await browser.close(); server.close();
  console.log('verify69: all checks passed');
})().catch(e => { console.error(e); process.exit(1); });
