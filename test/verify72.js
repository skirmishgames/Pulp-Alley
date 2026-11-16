// verify72.js — Adventure Cards tab: kinds, backs, save/edit/duplicate/delete,
// Recently Deleted, backup export/import, PNG and PDF downloads.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');
const handler = require('serve-handler');
const assert = require('assert');
const PORT = 8872;
const ROOT = path.join(__dirname, '..');
function ok(label) { console.log('OK  ', label); }

(async () => {
  const server = http.createServer((req, res) => handler(req, res, { public: ROOT }));
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1500, height: 950 } });
  const page = await ctx.newPage();
  page.on('pageerror', err => { console.error('PAGE ERROR:', err); process.exitCode = 1; });
  page.on('dialog', d => d.accept());
  await page.goto(`http://localhost:${PORT}/index.html`);
  await page.waitForTimeout(400);
  await page.click('.tab-btn[data-tab="adventure"]');
  assert(await page.isVisible('#tab-adventure'));
  ok('Adventure Cards tab opens');

  // Defaults: Challenge, one style only, title is the first field, number optional and blank.
  assert.strictEqual(await page.inputValue('#ac-style'), 'yellow', 'Pulp yellow is the default style');
  assert.deepStrictEqual(await page.$$eval('#ac-style option', o => o.map(x => x.value)), ['yellow', 'parchment']);
  // Ad blockers hide elements with ids like "adv-title" (Safari content blockers did).
  assert.strictEqual(await page.evaluate(() => document.querySelectorAll('[id^="adv-"], [class*="adv-"]').length), 0, 'no adv- ids or classes');
  assert(await page.isVisible('#ac-title'), 'title input is visible');
  assert.strictEqual(await page.evaluate(() => document.querySelector('#ac-form input, #ac-form select').id), 'ac-title', 'title is the first field');
  assert.strictEqual(await page.inputValue('#ac-number'), '', 'number starts blank');
  assert.strictEqual(await page.inputValue('#ac-kind'), 'Challenge');
  assert.deepStrictEqual(await page.$$eval('#ac-kind option', o => o.map(x => x.value)), ['Challenge', 'Peril', 'Reward', 'Spoiler']);
  ok('title first and visible, Pulp yellow default with Parchment option, number blank, four kinds');

  // Fieldsets follow the kind.
  const vis = async () => ({
    roll: await page.isVisible('#ac-roll-fieldset'), result: await page.isVisible('#ac-passfail-fieldset'),
    reward: await page.isVisible('#ac-reward-fieldset'), spoiler: await page.isVisible('#ac-spoiler-fieldset'), preset: await page.isVisible('#ac-preset-row'),
  });
  assert.deepStrictEqual(await vis(), { roll: true, result: true, reward: false, spoiler: false, preset: false });
  await page.selectOption('#ac-kind', 'Peril');
  assert.deepStrictEqual(await vis(), { roll: true, result: true, reward: false, spoiler: false, preset: false });
  assert(await page.isVisible('#ac-peril-hint'));
  await page.selectOption('#ac-kind', 'Reward');
  assert.deepStrictEqual(await vis(), { roll: false, result: false, reward: true, spoiler: false, preset: false });
  await page.selectOption('#ac-style', 'parchment');
  await page.selectOption('#ac-kind', 'Spoiler');
  assert.deepStrictEqual(await vis(), { roll: false, result: false, reward: false, spoiler: true, preset: true });
  await page.selectOption('#ac-preset', 'Red Herring');
  assert.strictEqual(await page.inputValue('#ac-title'), 'Red Herring', 'preset fills the title');
  ok('form shows only the fields each kind needs; spoiler presets fill the title');

  // Printed text.
  const body = (d) => page.evaluate(d => advBody(d), d);
  let b = await body({ kind: 'Peril', successes: 2, skills: ['Finesse', 'Cunning'], passText: '', failText: 'You fall.' });
  assert.strictEqual(b.skillText, 'Finesse or Cunning');
  assert.deepStrictEqual(b.sections, [{ label: 'Pass', text: 'No effect.' }, { label: 'Fail', text: 'Suffer 2 hits. You fall.' }]);
  b = await body({ kind: 'Peril', successes: 1, skills: ['Dodge'], failText: '' });
  assert.strictEqual(b.sections[1].text, 'Suffer 1 hit.');
  b = await body({ kind: 'Challenge', successes: 3, skills: ['Brawl', 'Shoot', 'Might'], passText: 'A', failText: 'B' });
  assert.strictEqual(b.skillText, 'Brawl, Shoot or Might');
  b = await body({ kind: 'Spoiler', title: 'Red Herring' });
  assert.deepStrictEqual(b.center.slice(0, 2), ['This is not a reward.', 'You do not become Director.']);
  b = await body({ kind: 'Reward', scenarioReward: 'S', leagueReward: 'L' });
  assert.deepStrictEqual(b.sections.map(s => s.label), ['Scenario Reward', 'League Reward']);
  ok('card text: skills joined with "or", Peril hits from successes, Spoiler fixed text, Reward sections');

  // Backs: Spoiler shares the Reward back, Peril shares the Challenge back.
  assert.strictEqual(await page.evaluate(() => [advBackKind('Spoiler'), advBackKind('Reward'), advBackKind('Peril'), advBackKind('Challenge')].join()), 'reward,reward,scenario,scenario');
  const png = (data, back) => page.evaluate(([d, back]) => { const c = document.createElement('canvas'); if (back) renderAdventureBack(c, d); else renderAdventureCard(c, d, null); return c.toDataURL(); }, [data, back]);
  for (const style of ['yellow', 'parchment']) {
    assert.strictEqual(await png({ kind: 'Spoiler', style }, true), await png({ kind: 'Reward', style }, true), `${style}: Spoiler and Reward backs match`);
    assert.strictEqual(await png({ kind: 'Peril', style }, true), await png({ kind: 'Challenge', style }, true), `${style}: Peril and Challenge backs match`);
    assert.notStrictEqual(await png({ kind: 'Reward', style }, true), await png({ kind: 'Challenge', style }, true), `${style}: reward and scenario backs differ`);
  }
  assert.notStrictEqual(await png({ kind: 'Challenge', style: 'yellow' }, true), await png({ kind: 'Challenge', style: 'parchment' }, true), 'styles have different backs');
  assert.strictEqual(await png({ kind: 'Challenge', style: 'classic' }, true), await png({ kind: 'Challenge', style: 'parchment' }, true), 'old "classic" cards draw as Parchment');
  const base = { title: 'Strong-Arm', skills: ['Might'], successes: 1, passText: 'x', failText: 'y' };
  const fronts = new Set();
  for (const kind of ['Challenge', 'Peril', 'Reward', 'Spoiler']) for (const style of ['yellow', 'parchment']) fronts.add(await png({ ...base, kind, style }, false));
  assert.strictEqual(fronts.size, 4, 'every kind draws differently; the style only changes the back');
  ok('backs: Spoiler=Reward, Peril=Challenge; 4 distinct fronts, style changes only the back');

  // Placeholder text shows in the preview only, never in saved/exported art.
  const withPh = await page.evaluate(() => { const c = document.createElement('canvas'); renderAdventureCard(c, { kind: 'Spoiler', title: 'T' }, null); return c.toDataURL(); });
  const noPh = await page.evaluate(() => { const c = document.createElement('canvas'); renderAdventureCard(c, { kind: 'Spoiler', title: 'T' }, null, { placeholder: false }); return c.toDataURL(); });
  assert.notStrictEqual(withPh, noPh, 'preview shows an UPLOAD IMAGE hint');
  ok('the "UPLOAD IMAGE" hint is preview-only');

  // Save a card with an image.
  await page.click('#ac-new');
  await page.selectOption('#ac-kind', 'Challenge');
  await page.fill('#ac-title', 'Strong-Arm');
  await page.fill('#ac-pass', 'Draw 1 Fortune card (one-use).');
  await page.fill('#ac-fail', 'Discard 1 random Fortune card.');
  await page.fill('#ac-number', '001');
  const artB64 = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 800; c.height = 400; const x = c.getContext('2d'); x.fillStyle = '#7799bb'; x.fillRect(0, 0, 800, 400); x.fillStyle = '#332211'; x.fillRect(0, 250, 800, 150); return c.toDataURL('image/png').split(',')[1]; });
  const artPath = path.join(require('os').tmpdir(), 'ac-art-test.png');
  fs.writeFileSync(artPath, Buffer.from(artB64, 'base64'));
  const before = await page.evaluate(() => document.getElementById('ac-canvas').toDataURL());
  await page.setInputFiles('#ac-image-file', artPath);
  await page.waitForTimeout(400);
  assert(await page.isVisible('#ac-img-controls'), 'image controls show');
  assert.notStrictEqual(await page.evaluate(() => document.getElementById('ac-canvas').toDataURL()), before, 'preview shows the image');
  await page.click('#ac-save');
  await page.waitForTimeout(400);
  assert.strictEqual(await page.$$eval('#ac-list .ac-item', n => n.length), 1);
  assert.strictEqual(await page.textContent('#ac-deck-title'), 'Adventure Deck (1)');
  const saved = await page.evaluate(async () => (await getAllAdventure())[0]);
  assert.strictEqual(saved.formData.kind, 'Challenge');
  assert(saved.formData.image && saved.formData.image.startsWith('data:image/jpeg'), 'image stored (downscaled JPEG)');
  assert(saved.pngDataURL.startsWith('data:image/png'));
  ok('saving stores the card and its image in the Adventure Deck');

  // The character gallery must not see it.
  assert.strictEqual(await page.evaluate(async () => (await getAllCards()).length), 0, 'not in the character cards store');
  await page.click('.tab-btn[data-tab="gallery"]');
  await page.waitForTimeout(300);
  assert(!/Strong-Arm/.test(await page.textContent('#tab-gallery')), 'My Cards does not list Adventure cards');
  ok('Adventure cards stay out of My Cards');
  await page.click('.tab-btn[data-tab="adventure"]');

  // New Card starts with a blank number; make a Spoiler + Reward + Peril with no number or deck.
  await page.click('#ac-new');
  assert.strictEqual(await page.inputValue('#ac-number'), '', 'New Card leaves the number blank');
  assert.strictEqual(await page.inputValue('#ac-deck'), '', 'and the deck name blank');
  await page.selectOption('#ac-kind', 'Spoiler');
  await page.selectOption('#ac-preset', 'It’s a Trap!');
  await page.fill('#ac-quote', 'You chose the wrong path.');
  await page.click('#ac-save'); await page.waitForTimeout(300);
  await page.click('#ac-new');
  assert.strictEqual(await page.inputValue('#ac-style'), 'parchment', 'New Card keeps the style');
  await page.selectOption('#ac-kind', 'Reward'); await page.fill('#ac-title', 'Hidden Cache');
  await page.fill('#ac-scenario-reward', 'Re-roll one Shoot die.'); await page.fill('#ac-league-reward', '+1 Contacts point.');
  await page.click('#ac-save'); await page.waitForTimeout(300);
  await page.click('#ac-new');
  await page.selectOption('#ac-kind', 'Peril'); await page.fill('#ac-title', 'Rickety Bridge');
  await page.check('.ac-skill[value="Finesse"]'); await page.uncheck('.ac-skill[value="Might"]');
  await page.selectOption('#ac-successes', '2');
  await page.click('#ac-save'); await page.waitForTimeout(300);
  assert.strictEqual(await page.$$eval('#ac-list .ac-item', n => n.length), 4);
  await page.selectOption('#ac-filter-kind', 'Peril');
  await page.waitForTimeout(250);
  assert.strictEqual(await page.$$eval('#ac-list .ac-item', n => n.length), 1, 'kind filter');
  await page.selectOption('#ac-filter-kind', '');
  await page.waitForTimeout(250);
  ok('four kinds saved, number optional, kind filter works');

  // Edit reloads every field.
  await page.click('.ac-item:has-text("Rickety Bridge") [data-act="edit"]');
  await page.waitForTimeout(300);
  assert.strictEqual(await page.inputValue('#ac-kind'), 'Peril');
  assert.strictEqual(await page.inputValue('#ac-successes'), '2');
  assert.deepStrictEqual(await page.$$eval('.ac-skill:checked', c => c.map(x => x.value)), ['Finesse']);
  await page.click('.ac-item:has-text("Strong-Arm") [data-act="edit"]');
  await page.waitForTimeout(400);
  assert.strictEqual(await page.inputValue('#ac-pass'), 'Draw 1 Fortune card (one-use).');
  assert(await page.isVisible('#ac-img-controls'), 'saved image comes back on edit');
  await page.fill('#ac-title', 'Strong-Arm Deluxe');
  await page.click('#ac-save'); await page.waitForTimeout(300);
  assert.strictEqual(await page.$$eval('#ac-list .ac-item', n => n.length), 4, 'edit updates in place');
  assert(/Strong-Arm Deluxe/.test(await page.textContent('#ac-list')));
  ok('Edit reloads a saved card (including its image) and saves in place');

  // Duplicate.
  await page.click('.ac-item:has-text("Hidden Cache") [data-act="duplicate"]');
  await page.waitForTimeout(300);
  assert.strictEqual(await page.$$eval('#ac-list .ac-item', n => n.length), 5);
  assert(/Hidden Cache copy/.test(await page.textContent('#ac-list')));
  ok('Duplicate');

  // Delete -> Recently Deleted -> Restore.
  await page.click('.ac-item:has-text("Hidden Cache copy") [data-act="delete"]');
  await page.waitForTimeout(300);
  assert.strictEqual(await page.$$eval('#ac-list .ac-item', n => n.length), 4);
  await page.click('#btn-recently-deleted');
  await page.waitForTimeout(300);
  const trashText = await page.textContent('#trash-list');
  assert(/Hidden Cache copy/.test(trashText) && /Adventure card/.test(trashText), 'trash lists the Adventure card');
  await page.click('#trash-list [data-trash-act="restore"]');
  await page.waitForTimeout(400);
  await page.click('#close-trash-modal');
  assert.strictEqual(await page.$$eval('#ac-list .ac-item', n => n.length), 5, 'restored');
  ok('Delete goes to Recently Deleted and Restore brings it back');

  // Backup export / import.
  const exp = await page.evaluate(() => exportAllData());
  assert.strictEqual(exp.adventureCards.length, 5);
  assert.strictEqual((await page.evaluate(() => exportAllData('Anything'))).adventureCards.length, 0, 'Theme-filtered export leaves Adventure cards out');
  await page.evaluate(async () => { for (const c of await getAllAdventure()) await deleteAdventure(c.id); });
  assert.strictEqual(await page.evaluate(async () => (await getAllAdventure()).length), 0);
  const res = await page.evaluate(async (d) => importAllData(d), exp);
  assert.strictEqual(res.adventureImported, 5);
  assert.strictEqual(await page.evaluate(async () => (await getAllAdventure()).length), 5);
  const oldBackup = { cards: [], rosters: [] };
  assert.strictEqual((await page.evaluate(async (d) => importAllData(d), oldBackup)).adventureImported, 0, 'older backups without Adventure cards still import');
  ok('Backup export/import round-trips Adventure cards; older backups still import');

  // Downloads.
  await page.reload(); await page.waitForTimeout(400);
  await page.click('.tab-btn[data-tab="adventure"]'); await page.waitForTimeout(400);
  assert.strictEqual(await page.$$eval('#ac-list .ac-item', n => n.length), 5, 'deck survives a reload');
  let dl = page.waitForEvent('download');
  await page.click('#ac-png');
  assert(/\.png$/.test((await dl).suggestedFilename()));
  dl = page.waitForEvent('download');
  await page.click('#ac-png-back');
  assert(/back\.png$/.test((await dl).suggestedFilename()));
  await page.click('#ac-pdf');
  assert(/Select at least one/.test(await page.textContent('#ac-save-status')), 'PDF needs a selection');
  await page.click('#ac-select-all');
  await page.waitForTimeout(250);
  assert.strictEqual(await page.$$eval('#ac-list .ac-item.selected', n => n.length), 5);
  dl = page.waitForEvent('download');
  await page.click('#ac-pdf');
  const d = await dl;
  assert.strictEqual(d.suggestedFilename(), 'adventure-deck.pdf');
  const pdfPath = path.join(require('os').tmpdir(), 'ac-deck-test.pdf');
  await d.saveAs(pdfPath);
  const pdf = fs.readFileSync(pdfPath).toString('latin1');
  assert.strictEqual((pdf.match(/\/Type\s*\/Page\b/g) || []).length, 2, '5 cards = one sheet of fronts + one sheet of backs');
  ok('front and back PNG downloads; PDF has a fronts page and a backs page');

  await browser.close(); server.close();
  console.log('verify72: all checks passed');
})().catch(e => { console.error(e); process.exit(1); });
