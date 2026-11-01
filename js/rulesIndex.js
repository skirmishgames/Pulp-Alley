// rulesIndex.js
// Rules Index tab: searchable table of keywords -> book + printed page.
// Data lives in rulesIndexData.js (RULES_INDEX, RULES_INDEX_BOOKS).

(function () {
  const body = document.getElementById('ri-body');
  if (!body || typeof RULES_INDEX === 'undefined') return;
  const searchEl = document.getElementById('ri-search');
  const bookEl = document.getElementById('ri-book');
  const typeEl = document.getElementById('ri-type');
  const countEl = document.getElementById('ri-count');
  const emptyEl = document.getElementById('ri-empty');

  // Lowercase, drop apostrophes, turn every other non-alphanumeric run into one space.
  function norm(s) {
    return String(s).toLowerCase().replace(/['\u2019]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  const BOOK_ORDER = ['core', 'ggv', 'vice'];
  const rows = RULES_INDEX.map(r => ({
    r,
    term: norm(r.term),
    hay: norm([r.term, r.alt, r.section, r.type, RULES_INDEX_BOOKS[r.book]].join(' '))
  }));

  Object.keys(RULES_INDEX_BOOKS).forEach(k => {
    const o = document.createElement('option');
    o.value = k; o.textContent = RULES_INDEX_BOOKS[k];
    bookEl.appendChild(o);
  });
  Array.from(new Set(RULES_INDEX.map(r => r.type))).sort().forEach(t => {
    const o = document.createElement('option');
    o.value = t; o.textContent = t;
    typeEl.appendChild(o);
  });

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  // Highlight query tokens inside the keyword text itself.
  function highlight(text, tokens) {
    if (!tokens.length) return escapeHtml(text);
    const lower = text.toLowerCase();
    const marks = new Array(text.length).fill(false);
    tokens.forEach(tok => {
      const re = tok.split('').map(ch => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join("['\u2019\\-\\s&]*");
      let m; const rx = new RegExp(re, 'g');
      while ((m = rx.exec(lower)) && m[0].length) {
        for (let i = m.index; i < m.index + m[0].length; i++) marks[i] = true;
      }
    });
    let out = '', open = false;
    for (let i = 0; i < text.length; i++) {
      if (marks[i] && !open) { out += '<mark>'; open = true; }
      if (!marks[i] && open) { out += '</mark>'; open = false; }
      out += escapeHtml(text[i]);
    }
    return out + (open ? '</mark>' : '');
  }

  // Lower score ranks first.
  function score(row, tokens, q) {
    if (!tokens.length) return 0;
    if (row.term === q) return 0;
    if (row.term.startsWith(q)) return 1;
    if (tokens.every(t => row.term.split(' ').some(w => w.startsWith(t)))) return 2;
    if (tokens.every(t => row.term.includes(t))) return 3;
    return 4;
  }

  function render() {
    const q = norm(searchEl.value);
    const tokens = q ? q.split(' ') : [];
    const book = bookEl.value, type = typeEl.value;
    let hits = rows.filter(x =>
      (!book || x.r.book === book) &&
      (!type || x.r.type === type) &&
      tokens.every(t => x.hay.includes(t))
    );
    hits = hits
      .map(x => ({ x, s: score(x, tokens, q) }))
      .sort((a, b) =>
        a.s - b.s ||
        (a.s > 0 && a.s < 4 ? a.x.term.length - b.x.term.length : 0) ||
        a.x.r.term.localeCompare(b.x.r.term, 'en', { sensitivity: 'base' }) ||
        BOOK_ORDER.indexOf(a.x.r.book) - BOOK_ORDER.indexOf(b.x.r.book))
      .map(h => h.x.r);

    body.innerHTML = hits.map(r => {
      const also = r.also && r.also.length ? `<span class="ri-also">also p. ${r.also.join(', ')}</span>` : '';
      return `<tr data-book="${r.book}"><td><span class="ri-term">${highlight(r.term, tokens)}</span>` +
        `<span class="ri-type-tag">${escapeHtml(r.type)}</span></td>` +
        `<td>${escapeHtml(RULES_INDEX_BOOKS[r.book])}</td>` +
        `<td class="ri-page">p. <strong>${r.page}</strong>${also}</td>` +
        `<td class="ri-section">${escapeHtml(r.section)}</td></tr>`;
    }).join('');
    countEl.textContent = `Showing ${hits.length} of ${rows.length} keywords`;
    emptyEl.style.display = hits.length ? 'none' : '';
  }

  searchEl.addEventListener('input', render);
  bookEl.addEventListener('change', render);
  typeEl.addEventListener('change', render);
  render();
})();
