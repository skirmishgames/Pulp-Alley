// adventure.js
// Adventure Cards tab: build Challenge / Peril / Reward / Spoiler cards,
// save them to an Adventure Deck (own IndexedDB store, see
// db.js), download PNGs and print a double-sided A4 PDF.
// Rendering lives in adventureRenderer.js. Loaded after app.js so it can
// use escapeHtml / escapeAttr / slugify / refreshTrashBadge from there.

const advEl = (id) => document.getElementById(id);
const advState = {
  editingId: null,
  createdAt: null,
  image: null,        // { dataURL, el }
  side: 'front',
  selected: new Set(),
  records: [],
};

const ADV_KIND_HINTS = {
  Challenge: 'A pre-written plot point: the skill roll, what passing earns (the Reward is printed on the card) and what failing costs. Play it instead of a Fortune challenge and a Reward card.',
  Peril: 'Any harmful situation other than fighting (Core Rules p. 45). A failed Peril costs hits equal to the number of successes.',
  Reward: 'Scenario Reward at the top applies to the holder of the plot point. League Reward below is earned at the end of the scenario (Core Rules p. 55).',
  Spoiler: 'Looks like a Reward but is not one: the plot point is not passed, no Reward is taken and you do not become Director (Core Rules p. 56). It shares the Reward back.',
};

// ---------------------------------------------------------------- form
function advBuildSkillBoxes() {
  advEl('ac-skills').innerHTML = ADV_SKILLS.map(s =>
    `<label class="checkbox-label"><input type="checkbox" class="ac-skill" value="${s}"${s === 'Might' ? ' checked' : ''}> ${s}</label>`
  ).join('');
}

function advCollect() {
  const skills = Array.from(document.querySelectorAll('.ac-skill:checked')).map(c => c.value);
  return {
    kind: advEl('ac-kind').value,
    style: advEl('ac-style').value,
    title: advEl('ac-title').value.trim(),
    skills: skills.length ? skills : ['Might'],
    successes: +advEl('ac-successes').value || 1,
    passText: advEl('ac-pass').value.trim(),
    failText: advEl('ac-fail').value.trim(),
    scenarioReward: advEl('ac-scenario-reward').value.trim(),
    leagueReward: advEl('ac-league-reward').value.trim(),
    spoilerNote: advEl('ac-spoiler-note').value.trim(),
    quote: advEl('ac-quote').value.trim(),
    deck: advEl('ac-deck').value.trim(),
    number: advEl('ac-number').value.trim(),
    imgZoom: +advEl('ac-zoom').value || 1,
    imgX: +advEl('ac-pan-x').value || 0,
    imgY: +advEl('ac-pan-y').value || 0,
    sepia: advEl('ac-sepia').checked,
    image: advState.image ? advState.image.dataURL : null,
  };
}

function advApplyKind() {
  const kind = advEl('ac-kind').value;
  const isRoll = kind === 'Challenge' || kind === 'Peril';
  advEl('ac-roll-fieldset').style.display = isRoll ? '' : 'none';
  advEl('ac-roll-fieldset').querySelector('legend').textContent = kind === 'Peril' ? 'Peril' : 'Challenge';
  advEl('ac-passfail-fieldset').style.display = isRoll ? '' : 'none';
  advEl('ac-reward-fieldset').style.display = kind === 'Reward' ? '' : 'none';
  advEl('ac-spoiler-fieldset').style.display = kind === 'Spoiler' ? '' : 'none';
  advEl('ac-preset-row').style.display = kind === 'Spoiler' ? '' : 'none';
  advEl('ac-peril-hint').style.display = kind === 'Peril' ? '' : 'none';
  const failLabel = advEl('ac-fail-label');
  failLabel.firstChild.nodeValue = kind === 'Peril' ? 'Extra effect on fail (optional)' : 'Fail';
  advEl('ac-pass').placeholder = kind === 'Peril' ? 'Blank prints "No effect."' : 'e.g. Draw 1 Fortune card (one-use).';
  advEl('ac-kind-hint').textContent = ADV_KIND_HINTS[kind];
}

function advSetImageControls() {
  advEl('ac-img-controls').style.display = advState.image ? '' : 'none';
}

let advDrawToken = 0;
async function advRedraw() {
  const token = ++advDrawToken;
  await advLoadFonts();
  if (token !== advDrawToken) return;
  const canvas = advEl('ac-canvas');
  const data = advCollect();
  if (advState.side === 'back') renderAdventureBack(canvas, data);
  else renderAdventureCard(canvas, data, advState.image ? advState.image.el : null);
}

// Downscale uploads so a saved deck stays small in the browser.
function advLoadImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const max = 1400;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      const x = c.getContext('2d');
      x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height);
      x.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
    img.src = url;
  });
}

async function advSetImageFromDataURL(dataURL) {
  if (!dataURL) { advState.image = null; advSetImageControls(); return; }
  const el = new Image();
  el.src = dataURL;
  try { await el.decode(); } catch { /* fall through; draw skips a broken image */ }
  advState.image = { dataURL, el };
  advSetImageControls();
}

function advResetForm() {
  advState.editingId = null;
  advState.createdAt = null;
  const keepStyle = advEl('ac-style').value; // a deck usually stays in one style
  advEl('ac-form').reset();
  advEl('ac-style').value = keepStyle;
  advBuildSkillBoxes();
  advState.image = null;
  advSetImageControls();
  advEl('ac-zoom').value = 1; advEl('ac-pan-x').value = 0; advEl('ac-pan-y').value = 0;
  advApplyKind();
  advRedraw();
}

async function advLoadRecord(rec) {
  const d = rec.formData || {};
  advState.editingId = rec.id;
  advState.createdAt = rec.createdAt || null;
  advEl('ac-kind').value = ADV_KINDS.includes(d.kind) ? d.kind : 'Challenge';
  advEl('ac-style').value = (d.style === 'parchment' || d.style === 'classic') ? 'parchment' : 'yellow';
  advEl('ac-title').value = d.title || '';
  advBuildSkillBoxes();
  document.querySelectorAll('.ac-skill').forEach(c => { c.checked = (d.skills || []).includes(c.value); });
  advEl('ac-successes').value = String(Math.max(1, Math.min(4, +d.successes || 1)));
  advEl('ac-pass').value = d.passText || '';
  advEl('ac-fail').value = d.failText || '';
  advEl('ac-scenario-reward').value = d.scenarioReward || '';
  advEl('ac-league-reward').value = d.leagueReward || '';
  advEl('ac-spoiler-note').value = d.spoilerNote || '';
  advEl('ac-quote').value = d.quote || '';
  advEl('ac-deck').value = d.deck || '';
  advEl('ac-number').value = d.number || '';
  advEl('ac-zoom').value = d.imgZoom || 1;
  advEl('ac-pan-x').value = d.imgX || 0;
  advEl('ac-pan-y').value = d.imgY || 0;
  advEl('ac-sepia').checked = d.sepia !== false;
  const preset = advEl('ac-preset');
  preset.value = Array.from(preset.options).some(o => o.value === d.title) ? d.title : '';
  await advSetImageFromDataURL(d.image || null);
  advApplyKind();
  advState.side = 'front';
  advSyncSideButtons();
  advRedraw();
}

// ---------------------------------------------------------------- save / list
function advFlash(msg) {
  const el = advEl('ac-save-status');
  el.textContent = msg;
  setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 3500);
}

async function advSave() {
  const data = advCollect();
  if (!data.title) { advFlash('Give the card a title first.'); advEl('ac-title').focus(); return; }
  await advLoadFonts();
  const c = document.createElement('canvas');
  renderAdventureCard(c, data, advState.image ? advState.image.el : null, { placeholder: false });
  const now = Date.now();
  const id = advState.editingId || `ac-${now}-${Math.random().toString(36).slice(2, 8)}`;
  const rec = { id, createdAt: advState.createdAt || now, updatedAt: now, formData: data, pngDataURL: c.toDataURL('image/png') };
  await saveAdventure(rec);
  advState.editingId = id; advState.createdAt = rec.createdAt;
  await refreshAdventure();
  if (typeof refreshBackupBanner === 'function') refreshBackupBanner();
  advFlash('Saved to your Adventure Deck.');
}

function advSortKey(r) {
  const n = String(r.formData?.number || '');
  const m = n.match(/(\d+)\s*$/);
  return [String(r.formData?.deck || ''), m ? +m[1] : Infinity, r.updatedAt || 0];
}

async function refreshAdventure() {
  advState.records = await getAllAdventure();
  const filter = advEl('ac-filter-kind').value;
  const rows = advState.records
    .filter(r => !filter || r.formData?.kind === filter)
    .sort((a, b) => {
      const ka = advSortKey(a), kb = advSortKey(b);
      return ka[0].localeCompare(kb[0]) || ka[1] - kb[1] || kb[2] - ka[2];
    });
  [...advState.selected].forEach(id => { if (!advState.records.some(r => r.id === id)) advState.selected.delete(id); });
  advEl('ac-deck-title').textContent = `Adventure Deck (${advState.records.length})`;
  advEl('ac-empty').style.display = advState.records.length ? 'none' : '';
  advEl('ac-list').innerHTML = rows.map(r => {
    const d = r.formData || {};
    const code = [d.deck, d.number].filter(Boolean).join(' ');
    return `
    <div class="ac-item${advState.selected.has(r.id) ? ' selected' : ''}" data-id="${escapeAttr(r.id)}">
      <label class="ac-item-check"><input type="checkbox" data-act="select"${advState.selected.has(r.id) ? ' checked' : ''} aria-label="Select ${escapeAttr(d.title || 'card')}"></label>
      <img src="${r.pngDataURL}" alt="">
      <div class="ac-item-body">
        <div class="ac-item-title">${escapeHtml(d.title || 'Untitled')}</div>
        <div class="ac-item-meta">${escapeHtml(d.kind || '')} &middot; ${(d.style === 'parchment' || d.style === 'classic') ? 'Art Deco back' : 'Pulp yellow back'}${code ? ' &middot; ' + escapeHtml(code) : ''}</div>
        <div class="ac-item-actions">
          <button type="button" class="btn-secondary" data-act="edit">Edit</button>
          <button type="button" class="btn-secondary" data-act="duplicate">Duplicate</button>
          <button type="button" class="btn-danger" data-act="delete">Delete</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

async function advDuplicate(rec) {
  const now = Date.now();
  const d = { ...rec.formData, title: (rec.formData.title || 'Untitled') + ' copy', number: '' };
  await saveAdventure({ ...rec, id: `ac-${now}-${Math.random().toString(36).slice(2, 8)}`, createdAt: now, updatedAt: now, formData: d });
  await refreshAdventure();
}

// ---------------------------------------------------------------- downloads
function advDownloadCanvas(canvas, name) {
  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}

async function advDownloadPNG(side) {
  const data = advCollect();
  await advLoadFonts();
  const c = document.createElement('canvas');
  if (side === 'back') renderAdventureBack(c, data);
  else renderAdventureCard(c, data, advState.image ? advState.image.el : null, { placeholder: false });
  const base = (typeof slugify === 'function' ? slugify(data.title || 'adventure-card') : 'adventure-card') || 'adventure-card';
  advDownloadCanvas(c, `${base}-${side}.png`);
}

// A4, 3 x 3 cards of 63.5 x 88.9 mm. Page 1 fronts, page 2 backs mirrored
// left to right so a long-edge duplex print lines up with the fronts.
async function advDownloadPDF() {
  const picked = advState.records.filter(r => advState.selected.has(r.id));
  if (!picked.length) { advFlash('Select at least one card in the deck first.'); return; }
  await advLoadFonts();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const CW = 63.5, CH = 88.9, X0 = (210 - CW * 3) / 2, Y0 = (297 - CH * 3) / 2;
  const marks = () => {
    doc.setDrawColor(90); doc.setLineWidth(0.2);
    for (let i = 0; i <= 3; i++) {
      const x = X0 + i * CW, y = Y0 + i * CH;
      doc.line(x, 4, x, Y0 - 2); doc.line(x, 297 - 4, x, Y0 + CH * 3 + 2);
      doc.line(4, y, X0 - 2, y); doc.line(210 - 4, y, X0 + CW * 3 + 2, y);
    }
  };
  const backCache = {};
  const backFor = (d) => {
    const key = advBackKind(d.kind) + ':' + ((d.style === 'parchment' || d.style === 'classic') ? 'parchment' : 'yellow');
    if (!backCache[key]) { const c = document.createElement('canvas'); renderAdventureBack(c, { kind: d.kind, style: d.style }); backCache[key] = c.toDataURL('image/png'); }
    return backCache[key];
  };
  let first = true;
  for (let i = 0; i < picked.length; i += 9) {
    const chunk = picked.slice(i, i + 9);
    if (!first) doc.addPage();
    first = false;
    marks();
    chunk.forEach((r, n) => doc.addImage(r.pngDataURL, 'PNG', X0 + (n % 3) * CW, Y0 + Math.floor(n / 3) * CH, CW, CH, undefined, 'FAST'));
    doc.addPage(); marks();
    chunk.forEach((r, n) => doc.addImage(backFor(r.formData), 'PNG', X0 + (2 - (n % 3)) * CW, Y0 + Math.floor(n / 3) * CH, CW, CH, undefined, 'FAST'));
  }
  doc.save('adventure-deck.pdf');
  advFlash(`PDF ready: ${picked.length} card${picked.length === 1 ? '' : 's'}.`);
}

// ---------------------------------------------------------------- wiring
function advSyncSideButtons() {
  advEl('ac-show-front').classList.toggle('active', advState.side === 'front');
  advEl('ac-show-back').classList.toggle('active', advState.side === 'back');
}

(function advInit() {
  if (!advEl('ac-form')) return;
  advBuildSkillBoxes();
  advApplyKind();

  advEl('ac-form').addEventListener('input', () => advRedraw());
  advEl('ac-form').addEventListener('change', () => advRedraw());
  advEl('ac-kind').addEventListener('change', () => { advApplyKind(); advRedraw(); });
  advEl('ac-style').addEventListener('change', () => advRedraw());
  advEl('ac-preset').addEventListener('change', (e) => {
    if (e.target.value) advEl('ac-title').value = e.target.value;
    advRedraw();
  });
  advEl('ac-title').addEventListener('input', () => {
    const p = advEl('ac-preset');
    if (p.value && p.value !== advEl('ac-title').value) p.value = '';
  });
  advEl('ac-image-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await advSetImageFromDataURL(await advLoadImageFile(file));
      advEl('ac-zoom').value = 1; advEl('ac-pan-x').value = 0; advEl('ac-pan-y').value = 0;
      advRedraw();
    } catch (err) { advFlash(err.message); }
    e.target.value = '';
  });
  advEl('ac-remove-image').addEventListener('click', async () => { await advSetImageFromDataURL(null); advRedraw(); });

  advEl('ac-show-front').addEventListener('click', () => { advState.side = 'front'; advSyncSideButtons(); advRedraw(); });
  advEl('ac-show-back').addEventListener('click', () => { advState.side = 'back'; advSyncSideButtons(); advRedraw(); });
  advEl('ac-save').addEventListener('click', advSave);
  advEl('ac-new').addEventListener('click', advResetForm);
  advEl('ac-png').addEventListener('click', () => advDownloadPNG('front'));
  advEl('ac-png-back').addEventListener('click', () => advDownloadPNG('back'));
  advEl('ac-pdf').addEventListener('click', advDownloadPDF);
  advEl('ac-filter-kind').addEventListener('change', refreshAdventure);
  advEl('ac-select-all').addEventListener('click', () => {
    const filter = advEl('ac-filter-kind').value;
    const visible = advState.records.filter(r => !filter || r.formData?.kind === filter);
    const allOn = visible.length && visible.every(r => advState.selected.has(r.id));
    visible.forEach(r => allOn ? advState.selected.delete(r.id) : advState.selected.add(r.id));
    refreshAdventure();
  });

  advEl('ac-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const row = btn.closest('.ac-item');
    const rec = advState.records.find(r => r.id === row.dataset.id);
    if (!rec) return;
    const act = btn.dataset.act;
    if (act === 'select') {
      if (btn.checked) advState.selected.add(rec.id); else advState.selected.delete(rec.id);
      row.classList.toggle('selected', btn.checked);
    } else if (act === 'edit') {
      await advLoadRecord(rec);
      advEl('ac-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (act === 'duplicate') {
      await advDuplicate(rec);
    } else if (act === 'delete') {
      if (!confirm(`Move “${rec.formData?.title || 'this card'}” to Recently Deleted?`)) return;
      await trashAdventure(rec.id);
      advState.selected.delete(rec.id);
      if (advState.editingId === rec.id) { advState.editingId = null; advState.createdAt = null; }
      await refreshAdventure();
      if (typeof refreshTrashBadge === 'function') refreshTrashBadge();
    }
  });

  refreshAdventure();
  advRedraw();
})();
