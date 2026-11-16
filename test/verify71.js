// verify71.js — Gang / Fireteam style: a label-only choice on Gang cards.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const handler = require('serve-handler');
const assert = require('assert');
const PORT = 8871;
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

  const stats = () => page.evaluate(() => JSON.stringify(collectFormData().stats));
  const health = () => page.evaluate(() => JSON.stringify(collectFormData().health));
  const abilitiesLen = () => page.evaluate(() => GANG_ABILITIES.length);

  // Hidden for non-Gang types; Gang is the default style.
  assert(!(await page.isVisible('#f-gangStyle')), 'style picker hidden for Leader');
  await page.selectOption('#f-cardType', 'Gang');
  assert(await page.isVisible('#f-gangStyle'), 'style picker shows for Gang');
  assert.strictEqual(await page.inputValue('#f-gangStyle'), 'Gang', 'Gang is the default');
  assert.strictEqual(await page.textContent('#gang-legend'), 'Gang');
  assert.deepStrictEqual(await page.$$eval('#f-gangStyle option', o => o.map(x => x.value)), ['Gang', 'Fireteam']);
  assert.strictEqual(await page.evaluate(() => collectFormData().gangStyle), 'Gang');
  ok('Gang is the default style, picker only shows for Gang cards');

  // Fireteam: same rules, only the label changes.
  await page.fill('#f-name', 'Stormtrooper Squad');
  await page.fill('#f-gangModels', '6');
  const statsGang = await stats(), healthGang = await health();
  const pngGangTagged = await (async () => {
    await page.check('#f-showCardType');
    await page.waitForTimeout(200);
    return page.evaluate(() => document.getElementById('card-canvas').toDataURL());
  })();
  await page.selectOption('#f-gangStyle', 'Fireteam');
  await page.waitForTimeout(200);
  assert.strictEqual(await page.textContent('#gang-legend'), 'Fireteam');
  assert(await page.isVisible('#gang-style-hint'), 'hint shows for Fireteam');
  assert.strictEqual(await page.evaluate(() => collectFormData().gangStyle), 'Fireteam');
  assert.strictEqual(await page.evaluate(() => collectFormData().cardType), 'Gang', 'Card Type stays Gang');
  assert.strictEqual(await stats(), statsGang, 'stats unchanged');
  assert.strictEqual(await health(), healthGang, 'health track unchanged');
  assert.strictEqual(await page.evaluate(() => collectFormData().level), 2, 'still Level 2');
  const pngFire = await page.evaluate(() => document.getElementById('card-canvas').toDataURL());
  assert.notStrictEqual(pngFire, pngGangTagged, 'the type tag on the card changes');
  assert.strictEqual(await page.evaluate(() => cardTypeLabel('Gang', 'Fireteam')), 'Fireteam');
  assert.strictEqual(await page.evaluate(() => cardTypeLabel('Gang', 'Gang')), 'Gang');
  assert.strictEqual(await page.evaluate(() => cardTypeLabel('Leader', 'Fireteam')), 'Leader');
  ok('Fireteam changes only the label: Card Type, Level, stats and health track stay the same');

  // Without the include checkbox the card is identical for both styles.
  await page.uncheck('#f-showCardType');
  await page.waitForTimeout(200);
  const pngFireNoTag = await page.evaluate(() => document.getElementById('card-canvas').toDataURL());
  await page.selectOption('#f-gangStyle', 'Gang');
  await page.waitForTimeout(200);
  const pngGangNoTag = await page.evaluate(() => document.getElementById('card-canvas').toDataURL());
  assert.strictEqual(pngFireNoTag, pngGangNoTag, 'untagged card looks the same');
  ok('with the type tag off, Gang and Fireteam cards are identical');

  // Save, reload, roster.
  await page.selectOption('#f-gangStyle', 'Fireteam');
  await page.check('#f-showCardType');
  await page.click('#btn-save-card');
  await page.waitForTimeout(300);
  await page.click('#btn-new-card');
  await page.waitForTimeout(200);
  assert.strictEqual(await page.inputValue('#f-gangStyle'), 'Gang', 'New Card resets to Gang');
  assert.strictEqual(await page.textContent('#gang-legend'), 'Gang');
  await page.click('.tab-btn[data-tab="gallery"]');
  await page.waitForTimeout(300);
  await page.click('.gallery-card:has-text("Stormtrooper Squad") [data-act="edit"]');
  await page.waitForTimeout(250);
  assert.strictEqual(await page.inputValue('#f-cardType'), 'Gang');
  assert.strictEqual(await page.inputValue('#f-gangStyle'), 'Fireteam', 'style reloads');
  assert.strictEqual(await page.textContent('#gang-legend'), 'Fireteam');
  assert.strictEqual(await page.inputValue('#f-gangModels'), '6');
  ok('saved Fireteam card reloads as Fireteam; New Card resets to Gang');

  // Old Gang card without the field loads as Gang.
  await page.evaluate(() => { const d = collectFormData(); delete d.gangStyle; loadCardIntoForm({ id: 'old', formData: d, pngDataURL: '' }); });
  await page.waitForTimeout(200);
  assert.strictEqual(await page.inputValue('#f-gangStyle'), 'Gang', 'cards saved before this change are Gang');
  ok('cards saved before the option existed load as Gang');

  await page.click('.tab-btn[data-tab="roster"]');
  await page.waitForTimeout(200);
  await page.click('#open-colleague-picker');
  await page.waitForTimeout(250);
  const pickerText = await page.textContent('#colleague-picker-list .library-item:has-text("Stormtrooper Squad") .library-item-level');
  assert.strictEqual(pickerText, 'Fireteam', 'picker shows Fireteam');
  await page.click('#colleague-picker-list .library-item:has-text("Stormtrooper Squad") .library-add-btn');
  await page.waitForTimeout(250);
  await page.click('#close-colleague-picker');
  const meta = await page.textContent('.roster-row:has-text("Stormtrooper Squad") .roster-row-meta');
  assert.strictEqual(meta, 'Fireteam', 'roster row shows Fireteam');
  const slots = await page.textContent('.roster-row:has-text("Stormtrooper Squad") .roster-row-slots');
  assert.strictEqual(slots.trim(), '2 slots', 'still costs 2 slots like a Gang');
  const printData = await page.evaluate(() => buildRosterPrintData().members.map(m => m.cardType));
  assert.deepStrictEqual(printData, ['Fireteam']);
  ok('roster picker, roster row and roster print show Fireteam; still 2 slots');

  // Still repeatable like a Gang.
  await page.click('#open-colleague-picker');
  await page.waitForTimeout(250);
  assert(await page.isVisible('#colleague-picker-list .library-item:has-text("Stormtrooper Squad")'), 'Fireteam can be added again');
  ok('a Fireteam can be added more than once, like a Gang');

  await browser.close(); server.close();
  console.log('verify71: all checks passed');
})().catch(e => { console.error(e); process.exit(1); });
