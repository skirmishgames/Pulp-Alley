// adventureRenderer.js
// Draws Adventure Deck cards (Challenge, Peril, Reward, Spoiler) and their
// backs onto a 750 x 1050 canvas (2.5 x 3.5 in at 300 dpi). The front uses
// the character card colours. The style picks the back:
//   yellow    - the default: lemon yellow like the printed Adventure Deck
//               backs, with a compass stamp
//   parchment - Art Deco back (the value name is kept for saved cards)

// Plain script (no modules). Uses roundedRectPath, wrapLines and hexToRgba
// from cardRenderer.js.

const ADV_W = 750;
const ADV_H = 1050;

const ADV_KINDS = ['Challenge', 'Peril', 'Reward', 'Spoiler'];
const ADV_SKILLS = ['Brawl', 'Shoot', 'Dodge', 'Might', 'Finesse', 'Cunning'];
const ADV_SPOILER_PRESETS = ['Red Herring', 'It’s a Trap!', 'Unexpected Twist'];

// Small heading printed above the text on Peril, Reward and Spoiler cards.
const ADV_LABELS = { Peril: 'PERIL', Reward: 'REWARD', Spoiler: 'SPOILER' };

// Spoilers are shuffled into the rewards stack (Core Rules p. 56), so they
// share the Reward back. Challenges and Perils share the Scenario back.
function advBackKind(kind) {
  return (kind === 'Reward' || kind === 'Spoiler') ? 'reward' : 'scenario';
}

// Deterministic pseudo-random numbers so a card always looks the same.
function advRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
function advHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function advSkillText(skills) {
  const list = (skills && skills.length ? skills : ['Might']).slice();
  if (list.length === 1) return list[0];
  return list.slice(0, -1).join(', ') + ' or ' + list[list.length - 1];
}
// Skill names in bold, the joining ", " and "or" in regular weight,
// centred on cx and shrunk to fit maxW.
function advDrawSkillLine(ctx, skills, cx, y, maxW) {
  const list = (skills && skills.length ? skills : ['Might']).slice();
  const parts = [];
  list.forEach((sk, i) => {
    if (i > 0) parts.push({ t: i === list.length - 1 ? ' or ' : ', ', bold: false });
    parts.push({ t: sk, bold: true });
  });
  let px = 48, widths, total;
  const font = (bold, p) => `${bold ? 700 : 400} ${p}px Inter, sans-serif`;
  for (; px >= 28; px -= 2) {
    widths = parts.map(pt => { ctx.font = font(pt.bold, px); return ctx.measureText(pt.t).width; });
    total = widths.reduce((a, b) => a + b, 0);
    if (total <= maxW) break;
  }
  const align = ctx.textAlign; ctx.textAlign = 'left';
  let x = cx - total / 2;
  parts.forEach((pt, i) => { ctx.font = font(pt.bold, px); ctx.fillText(pt.t, x, y); x += widths[i]; });
  ctx.textAlign = align;
}

function advSuccessText(n) {
  return `${n} success${n === 1 ? '' : 'es'}`;
}
function advCode(data) {
  const n = String(data.number || '').trim();
  const deck = String(data.deck || '').trim();
  return [deck, n].filter(Boolean).join(' ');
}

// Text that is printed on the card for this data ().
function advBody(data) {
  const kind = data.kind;
  const n = Math.max(1, Math.min(4, +data.successes || 1));
  const out = { kind, n, skillText: advSkillText(data.skills), sections: [], center: null };
  if (kind === 'Challenge') {
    out.sections.push({ label: 'Pass', text: data.passText || '' });
    out.sections.push({ label: 'Fail', text: data.failText || '' });
  } else if (kind === 'Peril') {
    out.sections.push({ label: 'Pass', text: data.passText || 'No effect.' });
    const hits = `Suffer ${n} hit${n === 1 ? '' : 's'}.`;
    out.sections.push({ label: 'Fail', text: (hits + ' ' + (data.failText || '')).trim() });
  } else if (kind === 'Reward') {
    out.sections.push({ label: 'Scenario Reward', text: data.scenarioReward || '' });
    out.sections.push({ label: 'League Reward', text: data.leagueReward || '' });
  } else if (kind === 'Spoiler') {
    out.center = ['This is not a reward.', 'You do not become Director.', data.spoilerNote || 'See the scenario for details.'];
  }
  return out;
}

// ---------------------------------------------------------------- images
// Draws img into the box, cover-fitted, with zoom (>= 1) and pan (-1..1).
function advDrawImageCover(ctx, img, x, y, w, h, zoom, panX, panY) {
  const z = Math.max(1, +zoom || 1);
  const scale = Math.max(w / img.width, h / img.height) * z;
  const dw = img.width * scale, dh = img.height * scale;
  const maxX = (dw - w) / 2, maxY = (dh - h) / 2;
  const dx = x + (w - dw) / 2 + Math.max(-1, Math.min(1, +panX || 0)) * maxX;
  const dy = y + (h - dh) / 2 + Math.max(-1, Math.min(1, +panY || 0)) * maxY;
  ctx.drawImage(img, dx, dy, dw, dh);
}

function advImagePlaceholder(ctx, x, y, w, h, fg, label) {
  ctx.save();
  ctx.strokeStyle = fg;
  ctx.globalAlpha = 0.55;
  ctx.setLineDash([12, 10]);
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
  ctx.setLineDash([]);
  ctx.fillStyle = fg;
  ctx.font = '600 24px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label || 'UPLOAD IMAGE', x + w / 2, y + h / 2);
  ctx.restore();
}

// ---------------------------------------------------------------- front
function advFitFont(ctx, text, maxW, startPx, minPx, fontFn) {
  let px = startPx;
  ctx.font = fontFn(px);
  while (px > minPx && ctx.measureText(text).width > maxW) { px -= 2; ctx.font = fontFn(px); }
  return px;
}

// Measures wrapped sections; returns {lines, height}. Each section prints
// as: bold label + text, wrapped, left aligned, with a gap between sections.
function advLayoutSections(ctx, sections, maxW, px, bold, regular, lineH, gap) {
  const blocks = [];
  let total = 0;
  sections.forEach((s, i) => {
    ctx.font = bold(px);
    const labelText = s.label + ':';
    const labelW = ctx.measureText(labelText + ' ').width;
    ctx.font = regular(px);
    const words = String(s.text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '', curW = labelW;
    let first = true;
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      const limit = first ? maxW - labelW : maxW;
      if (ctx.measureText(test).width > limit && cur) { lines.push(cur); cur = w; first = false; } else cur = test;
    }
    if (cur || !lines.length) lines.push(cur);
    blocks.push({ label: labelText, labelW, lines });
    total += lines.length * lineH + (i < sections.length - 1 ? gap : 0);
  });
  return { blocks, height: total };
}

// Lemon yellow card stock like the printed Adventure Deck backs, with
// faint olive mottling and slightly darker edges.
// Back colours. Scenario backs are lemon yellow like the printed deck;
// Reward backs are the deep blue of the printed Reward cards.
const ADV_BACK_COLOURS = {
  scenario: { centre: '#ecdc4a', edge: '#d6c337', dark: 'rgba(150,135,30,0.12)', light: 'rgba(250,240,120,0.14)', speckDark: 'rgba(120,105,20,0.09)', speckLight: 'rgba(250,240,140,0.08)', band: '#857430', facet: '#d6c337' },
  reward:   { centre: '#2b4d79', edge: '#1d3759', dark: 'rgba(5,15,35,0.16)', light: 'rgba(110,150,200,0.10)', speckDark: 'rgba(5,15,35,0.12)', speckLight: 'rgba(150,180,220,0.06)', band: '#0e1e38', facet: '#7fa9d8' },
};

function advPulpYellow(ctx, seed, pal) {
  pal = pal || ADV_BACK_COLOURS.scenario;
  const rnd = advRng(seed);
  const g = ctx.createRadialGradient(ADV_W / 2, ADV_H * 0.45, 60, ADV_W / 2, ADV_H * 0.45, ADV_H * 0.8);
  g.addColorStop(0, pal.centre); g.addColorStop(1, pal.edge);
  ctx.fillStyle = g; ctx.fillRect(0, 0, ADV_W, ADV_H);
  for (let i = 0; i < 34; i++) {
    const x = rnd() * ADV_W, y = rnd() * ADV_H, r = 40 + rnd() * 170;
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, rnd() > 0.5 ? pal.dark : pal.light);
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rg; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 2200; i++) {
    ctx.fillStyle = rnd() > 0.5 ? pal.speckDark : pal.speckLight;
    ctx.fillRect(rnd() * ADV_W, rnd() * ADV_H, 1 + rnd() * 2.5, 1 + rnd() * 2.5);
  }
}

// Olive band along the bottom of the yellow back.
function advOliveBand(ctx, y, h, seed, colour) {
  const rnd = advRng(seed);
  ctx.fillStyle = colour || '#857430'; ctx.fillRect(0, y, ADV_W, h);
  for (let i = 0; i < Math.round(h * 8); i++) {
    ctx.fillStyle = rnd() > 0.5 ? 'rgba(60,50,15,0.14)' : 'rgba(190,170,70,0.10)';
    ctx.fillRect(rnd() * ADV_W, y + rnd() * h, 1 + rnd() * 4, 1 + rnd() * 2);
  }
}

// The front uses the character card palette (cardRenderer.js CLASSICAL_BASE):
// parchment field, olive-khaki footer bar, near-black ink.
// The title band follows the printed Adventure Deck (green to yellow, red title).
const ADV_CC = {
  bgTop: '#e9cb9f', bgBottom: '#ddbb8a',
  ink: '#241b13', ink2: '#332617', label: '#241b13',
  footer: '#bfab63',
  art: '#e7c786', artPattern: 'rgba(36,27,19,0.10)', line: 'rgba(20,14,8,0.8)',
};

function advRenderFront(ctx, data, body, img, opts) {
  const C = ADV_CC;
  const rnd = advRng(advHash((data.title || '') + data.kind));
  const g = ctx.createLinearGradient(0, 0, 0, ADV_H);
  g.addColorStop(0, C.bgTop); g.addColorStop(1, C.bgBottom);
  ctx.fillStyle = g; ctx.fillRect(0, 0, ADV_W, ADV_H);
  for (let i = 0; i < 18; i++) {
    const x = rnd() * ADV_W, y = rnd() * ADV_H, r = 80 + rnd() * 180;
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, 'rgba(140,95,45,0.07)'); rg.addColorStop(1, 'rgba(140,95,45,0)');
    ctx.fillStyle = rg; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Title band like the printed Adventure Deck: olive green fading to
  // yellow, red condensed title with a light edge.
  const bandY = 34, bandH = 100;
  const bg = ctx.createLinearGradient(0, 0, ADV_W, 0);
  bg.addColorStop(0, '#a2b443'); bg.addColorStop(0.45, '#cbc24e'); bg.addColorStop(1, '#f3cf52');
  ctx.fillStyle = bg; ctx.fillRect(0, bandY, ADV_W, bandH);
  ctx.fillStyle = 'rgba(255,250,215,0.30)'; ctx.fillRect(0, bandY, ADV_W, 6);
  ctx.fillStyle = 'rgba(90,80,20,0.22)'; ctx.fillRect(0, bandY + bandH - 4, ADV_W, 4);
  const isRoll = body.kind === 'Challenge' || body.kind === 'Peril';
  const title = String(data.title || 'Untitled').trim() || 'Untitled';
  advFitFont(ctx, title, 650, 72, 34, px => `700 ${px}px Oswald, "Arial Narrow", sans-serif`);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,246,220,0.85)'; ctx.fillText(title, ADV_W / 2 + 2, bandY + bandH / 2 + 3);
  ctx.fillStyle = '#b52f28'; ctx.fillText(title, ADV_W / 2, bandY + bandH / 2);

  let y = bandY + bandH + 24;
  const left = 64, textW = ADV_W - left * 2;
  const label = ADV_LABELS[body.kind] || '';
  if (label) {
    ctx.fillStyle = C.label; ctx.font = '700 30px Rajdhani, Inter, sans-serif';
    ctx.textBaseline = 'top';
    advTracked(ctx, label, ADV_W / 2, y, 6);
    y += 46;
  }

  // Reserve the art, quote and footer from the bottom.
  const footTop = ADV_H - 64;
  const quote = String(data.quote || '').trim();
  let quoteLines = [];
  if (quote) {
    ctx.font = 'italic 400 27px Georgia, "Times New Roman", serif';
    quoteLines = wrapLines(ctx, '“' + quote + '”', 580);
  }
  const quoteH = quoteLines.length ? quoteLines.length * 34 + 12 : 0;
  const imgH = body.kind === 'Spoiler' ? 360 : body.kind === 'Reward' ? 300 : 270;
  const imgBottom = footTop - 24 - quoteH;
  const imgTop = imgBottom - imgH;

  ctx.textBaseline = 'top'; ctx.textAlign = 'center';
  if (isRoll) {
    // The roll sits straight on the parchment.
    const boxH = 132;
    ctx.fillStyle = C.ink2; ctx.font = '400 36px Inter, sans-serif';
    ctx.fillText(`Roll ${advSuccessText(body.n)} with`, ADV_W / 2, y + 16);
    ctx.fillStyle = C.ink;
    advDrawSkillLine(ctx, data.skills, ADV_W / 2, y + 66, textW);
    y += boxH + 26;
  }
  ctx.fillStyle = C.ink;
  if (body.center) {
    ctx.font = '400 32px Inter, sans-serif';
    y += 10;
    body.center.forEach(line => {
      wrapLines(ctx, line, textW).forEach(l => { ctx.fillText(l, ADV_W / 2, y); y += 46; });
    });
  } else {
    const avail = imgTop - 22 - y;
    let px = 36, lay;
    for (; px >= 20; px -= 2) {
      lay = advLayoutSections(ctx, body.sections, textW, px,
        p => `700 ${p}px Inter, sans-serif`, p => `400 ${p}px Inter, sans-serif`, Math.round(px * 1.32), 24);
      if (lay.height <= avail) break;
    }
    ctx.textAlign = 'left';
    const lh = Math.round(px * 1.32);
    let ty = y + Math.max(0, (avail - lay.height) / 2);
    lay.blocks.forEach(b => {
      b.lines.forEach((line, i) => {
        let x = left;
        if (i === 0) {
          ctx.font = `700 ${px}px Inter, sans-serif`;
          ctx.fillStyle = C.label; ctx.fillText(b.label, left, ty);
          ctx.fillStyle = C.ink;
          x = left + b.labelW;
        }
        ctx.font = `400 ${px}px Inter, sans-serif`;
        ctx.fillText(line, x, ty);
        ty += lh;
      });
      ty += 24;
    });
  }

  // Art box with an ink border, like the character portrait.
  const ix = 50, iw = ADV_W - 100;
  ctx.save();
  ctx.beginPath(); ctx.rect(ix, imgTop, iw, imgH); ctx.clip();
  if (img) {
    if (data.sepia !== false) ctx.filter = 'sepia(1) contrast(1.05) brightness(0.98)';
    advDrawImageCover(ctx, img, ix, imgTop, iw, imgH, data.imgZoom, data.imgX, data.imgY);
    ctx.filter = 'none';
  } else {
    ctx.fillStyle = C.art; ctx.fillRect(ix, imgTop, iw, imgH);
    ctx.strokeStyle = C.artPattern; ctx.lineWidth = 10;
    for (let d = -imgH; d < iw; d += 30) {
      ctx.beginPath(); ctx.moveTo(ix + d, imgTop + imgH); ctx.lineTo(ix + d + imgH, imgTop); ctx.stroke();
    }
  }
  ctx.restore();
  ctx.strokeStyle = C.line; ctx.lineWidth = 3; ctx.strokeRect(ix + 1.5, imgTop + 1.5, iw - 3, imgH - 3);
  if (!img && opts.placeholder !== false) {
    ctx.fillStyle = 'rgba(36,27,19,0.5)'; ctx.font = '600 24px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('UPLOAD IMAGE', ADV_W / 2, imgTop + imgH / 2);
  }

  if (quoteLines.length) {
    ctx.fillStyle = C.ink2; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = 'italic 400 27px Georgia, "Times New Roman", serif';
    quoteLines.forEach((l, i) => ctx.fillText(l, ADV_W / 2, imgBottom + 14 + i * 34));
  }

  // Olive footer bar, like the character health bar.
  ctx.fillStyle = C.footer; ctx.fillRect(0, footTop, ADV_W, ADV_H - footTop);
  ctx.fillStyle = C.line; ctx.fillRect(0, footTop, ADV_W, 4);
  const code = advCode(data);
  if (code) {
    ctx.fillStyle = C.ink; ctx.font = '700 26px Rajdhani, Inter, sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(code, ADV_W - 50, footTop + 32);
  }
}

// ---------------------------------------------------------------- back
// Art Deco pulp back: deep colour field, gold sunburst, compass emblem,
// stepped gold border. Scenario backs are oxblood, Reward backs bottle
// green, so the two stacks sort at a glance.
const ADV_BACKS = {
  scenario: { word: 'SCENARIO', inner: '#6e221d', outer: '#240807' },
  reward:   { word: 'REWARD',   inner: '#1f4b3b', outer: '#081a13' },
};

function advGold(ctx, x0, y0, x1, y1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, '#f6e2a6'); g.addColorStop(0.45, '#d9a94e');
  g.addColorStop(0.55, '#c08b35'); g.addColorStop(1, '#f0d48c');
  return g;
}

// Draws text with even letter spacing (canvas letterSpacing is not in
// every browser yet). Centred on cx.
function advTracked(ctx, text, cx, y, spacing) {
  const chars = [...text];
  const widths = chars.map(c => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let x = cx - total / 2;
  const align = ctx.textAlign; ctx.textAlign = 'left';
  chars.forEach((c, i) => { ctx.fillText(c, x, y); x += widths[i] + spacing; });
  ctx.textAlign = align;
  return total;
}

// Rectangle with stepped (notched) Art Deco corners.
function advDecoFrame(ctx, x, y, w, h, n) {
  ctx.beginPath();
  ctx.moveTo(x + n, y); ctx.lineTo(x + w - n, y);
  ctx.lineTo(x + w - n, y + n); ctx.lineTo(x + w, y + n);
  ctx.lineTo(x + w, y + h - n); ctx.lineTo(x + w - n, y + h - n);
  ctx.lineTo(x + w - n, y + h); ctx.lineTo(x + n, y + h);
  ctx.lineTo(x + n, y + h - n); ctx.lineTo(x, y + h - n);
  ctx.lineTo(x, y + n); ctx.lineTo(x + n, y + n);
  ctx.closePath();
}

// Eight-point compass star with faceted gold points.
function advCompassStar(ctx, cx, cy, R, ink) {
  const pts = [];
  for (let i = 0; i < 8; i++) pts.push({ a: -Math.PI / 2 + i * Math.PI / 4, len: i % 2 ? R * 0.56 : R });
  // draw the short (diagonal) points first so the long ones sit on top
  [...pts.filter((p, i) => i % 2), ...pts.filter((p, i) => !(i % 2))].forEach(p => {
    const w = p.len === R ? R * 0.17 : R * 0.13;
    const tipX = cx + Math.cos(p.a) * p.len, tipY = cy + Math.sin(p.a) * p.len;
    const lx = cx + Math.cos(p.a - Math.PI / 2) * w, ly = cy + Math.sin(p.a - Math.PI / 2) * w;
    const rx = cx + Math.cos(p.a + Math.PI / 2) * w, ry = cy + Math.sin(p.a + Math.PI / 2) * w;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(lx, ly); ctx.lineTo(tipX, tipY); ctx.closePath();
    ctx.fillStyle = p.len === R ? '#f3d991' : '#c9974a'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(rx, ry); ctx.lineTo(tipX, tipY); ctx.closePath();
    ctx.fillStyle = p.len === R ? '#b07e2c' : '#8a6226'; ctx.fill();
  });
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.12, 0, Math.PI * 2);
  ctx.fillStyle = ink; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = '#e8c372'; ctx.stroke();
}

function advRenderDecoBack(ctx, backKind, seed) {
  const pal = ADV_BACKS[backKind] || ADV_BACKS.scenario;
  const cx = ADV_W / 2, cy = 480;
  const rnd = advRng(seed);

  // Colour field with a soft glow behind the emblem.
  const bg = ctx.createRadialGradient(cx, cy, 40, cx, cy, ADV_H * 0.75);
  bg.addColorStop(0, pal.inner); bg.addColorStop(1, pal.outer);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, ADV_W, ADV_H);

  // Sunburst rays, clipped to the inner frame.
  const fx = 46, fy = 46, fw = ADV_W - 92, fh = ADV_H - 92, notch = 34;
  ctx.save();
  advDecoFrame(ctx, fx, fy, fw, fh, notch); ctx.clip();
  const rays = 48;
  for (let i = 0; i < rays; i += 2) {
    const a0 = (i / rays) * Math.PI * 2, a1 = ((i + 1) / rays) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, ADV_H, a0, a1); ctx.closePath();
    const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 620);
    rg.addColorStop(0, 'rgba(240,200,120,0.16)'); rg.addColorStop(1, 'rgba(240,200,120,0)');
    ctx.fillStyle = rg; ctx.fill();
  }
  // Fine print grain, evenly spread (no bright specks at the edges).
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = rnd() > 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,235,190,0.035)';
    ctx.fillRect(rnd() * ADV_W, rnd() * ADV_H, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  ctx.restore();

  // Gold frame: heavy outer line, fine inner line.
  ctx.lineJoin = 'miter';
  ctx.strokeStyle = advGold(ctx, 0, 0, ADV_W, ADV_H);
  ctx.lineWidth = 7; advDecoFrame(ctx, fx, fy, fw, fh, notch); ctx.stroke();
  ctx.lineWidth = 2; advDecoFrame(ctx, fx + 16, fy + 16, fw - 32, fh - 32, notch - 6); ctx.stroke();
  // Diamonds at the middle of each side.
  const dia = (x, y, r) => { ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); ctx.fill(); };
  ctx.fillStyle = advGold(ctx, 0, 0, ADV_W, ADV_H);
  dia(cx, fy, 12); dia(cx, fy + fh, 12); dia(fx, ADV_H / 2, 12); dia(fx + fw, ADV_H / 2, 12);

  // Top line: ADVENTURE DECK with rules either side.
  ctx.fillStyle = '#e9c97e'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  ctx.font = '700 25px Inter, sans-serif';
  const tw = advTracked(ctx, 'ADVENTURE DECK', cx, 148, 7);
  ctx.fillRect(cx - tw / 2 - 112, 147, 90, 2); ctx.fillRect(cx + tw / 2 + 22, 147, 90, 2);

  // Compass bezel: two rings and tick marks.
  ctx.strokeStyle = advGold(ctx, cx - 200, cy - 200, cx + 200, cy + 200);
  ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, 200, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, 178, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 72; i++) {
    const a = i * Math.PI / 36, long = i % 9 === 0;
    const r0 = long ? 160 : 170, r1 = 178;
    ctx.lineWidth = long ? 3 : 1.5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.arc(cx, cy, 158, 0, Math.PI * 2); ctx.fill();
  advCompassStar(ctx, cx, cy, 150, pal.outer);

  // The deck word, big, with a fine rule and small diamond underneath.
  ctx.fillStyle = advGold(ctx, 0, 780, 0, 860);
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  advFitFont(ctx, pal.word, fw - 120, 92, 50, px => `400 ${px}px "Alfa Slab One", Georgia, serif`);
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowOffsetY = 4; ctx.shadowBlur = 0;
  ctx.fillText(pal.word, cx, 850);
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#e9c97e';
  ctx.fillRect(cx - 170, 888, 150, 2); ctx.fillRect(cx + 20, 888, 150, 2);
  dia(cx, 889, 8);
  ctx.font = '700 20px Inter, sans-serif'; ctx.textBaseline = 'middle';
  advTracked(ctx, 'PULP ALLEY', cx, 932, 9);
}

// ---------------------------------------------------------------- stamps
// Black-ink compass stamp for the yellow back, drawn centred on 0,0
// inside a radius of about 240. Cream = #fffaf0, ink = #140c05.
const ADV_INK = '#140c05', ADV_CREAM = '#fffaf0', ADV_RED = '#b8271f';

function advStampRing(ctx) {
  ctx.lineWidth = 26; ctx.strokeStyle = ADV_CREAM;
  ctx.beginPath(); ctx.arc(0, 0, 232, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 12; ctx.strokeStyle = ADV_INK;
  ctx.beginPath(); ctx.arc(0, 0, 232, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(0, 0, 208, 0, Math.PI * 2); ctx.stroke();
  // little studs around the ring
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI / 12;
    ctx.beginPath(); ctx.arc(Math.cos(a) * 220, Math.sin(a) * 220, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = ADV_INK; ctx.fill();
  }
}

function advStampCompass(ctx, facet) {
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 4, long = i % 2 === 0;
    const len = long ? 185 : 105, w = long ? 32 : 22;
    const tip = [Math.cos(a) * len, Math.sin(a) * len];
    const l = [Math.cos(a - Math.PI / 2) * w, Math.sin(a - Math.PI / 2) * w];
    const r = [Math.cos(a + Math.PI / 2) * w, Math.sin(a + Math.PI / 2) * w];
    ctx.lineJoin = 'miter'; ctx.lineWidth = 4; ctx.strokeStyle = ADV_INK;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(...l); ctx.lineTo(...tip); ctx.closePath();
    ctx.fillStyle = ADV_INK; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(...r); ctx.lineTo(...tip); ctx.closePath();
    ctx.fillStyle = long ? ADV_CREAM : (facet || '#d6c337'); ctx.fill(); ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2);
  ctx.fillStyle = ADV_RED; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = ADV_INK; ctx.stroke();
}

// Faceted gem for the Reward back: the treasure at the end of the plot.
function advStampGem(ctx, facet) {
  // outline points: table top, crown corners, pavilion tip
  const T = -120, C = -50, B = 150, W1 = 85, W2 = 160;
  const pts = { tl: [-W1, T], tr: [W1, T], cl: [-W2, C], cr: [W2, C], b: [0, B],
    t1: [-28, T], t2: [28, T], c1: [-80, C], c2: [0, C], c3: [80, C] };
  const poly = (list, fill) => {
    ctx.beginPath(); list.forEach((k, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, ...pts[k])); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill(); ctx.stroke();
  };
  ctx.lineJoin = 'round'; ctx.strokeStyle = ADV_INK; ctx.lineWidth = 5;
  // white halo so the gem stands off the ring
  ctx.save(); ctx.lineWidth = 22; ctx.strokeStyle = ADV_CREAM;
  ctx.beginPath(); ['tl', 'tr', 'cr', 'b', 'cl'].forEach((k, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, ...pts[k])); ctx.closePath(); ctx.stroke();
  ctx.restore();
  // crown facets
  poly(['tl', 't1', 'c1', 'cl'], facet);
  poly(['t1', 't2', 'c2', 'c1'], ADV_CREAM);
  poly(['t1', 'c1', 'c2'], ADV_CREAM);
  poly(['t2', 'tr', 'cr', 'c3'], ADV_INK);
  poly(['t2', 'c3', 'c2'], facet);
  // pavilion facets
  poly(['cl', 'c1', 'b'], ADV_INK);
  poly(['c1', 'c2', 'b'], facet);
  poly(['c2', 'c3', 'b'], ADV_CREAM);
  poly(['c3', 'cr', 'b'], facet);
  // heavy outline
  ctx.lineWidth = 9;
  ctx.beginPath(); ['tl', 'tr', 'cr', 'b', 'cl'].forEach((k, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, ...pts[k])); ctx.closePath(); ctx.stroke();
  // sparkle
  ctx.fillStyle = ADV_CREAM; ctx.strokeStyle = ADV_INK; ctx.lineWidth = 3;
  ctx.beginPath();
  const sx = 120, sy = -125;
  ctx.moveTo(sx, sy - 34); ctx.lineTo(sx + 8, sy - 8); ctx.lineTo(sx + 34, sy); ctx.lineTo(sx + 8, sy + 8);
  ctx.lineTo(sx, sy + 34); ctx.lineTo(sx - 8, sy + 8); ctx.lineTo(sx - 34, sy); ctx.lineTo(sx - 8, sy - 8); ctx.closePath();
  ctx.fill(); ctx.stroke();
}

// Yellow back in the style of the printed Adventure Deck backs: lemon
// yellow, white outlined lettering, olive band with the stack name. The
// compass stamp stands in for the publisher's logo artwork.
function advRenderYellowBack(ctx, backKind, seed) {
  const cx = ADV_W / 2;
  const pal = ADV_BACK_COLOURS[backKind] || ADV_BACK_COLOURS.scenario;
  advPulpYellow(ctx, advHash('yellow-back'), pal);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  advFitFont(ctx, 'PULP ALLEY', ADV_W - 130, 100, 60, px => `400 ${px}px "Alfa Slab One", Georgia, serif`);
  ctx.strokeStyle = '#2a2415'; ctx.lineWidth = 14; ctx.strokeText('PULP ALLEY', cx, 170);
  ctx.fillStyle = '#f1eee4'; ctx.fillText('PULP ALLEY', cx, 170);
  ctx.save();
  ctx.translate(cx, 515); ctx.rotate(-0.05);
  advStampRing(ctx);
  if (backKind === 'reward') advStampGem(ctx, pal.facet);
  else advStampCompass(ctx, pal.facet);
  ctx.restore();
  advOliveBand(ctx, 830, 140, advHash('bottom-band'), pal.band);
  const word = backKind === 'reward' ? 'REWARD' : 'SCENARIO';
  advFitFont(ctx, word, ADV_W - 110, 86, 50, px => `400 ${px}px "Alfa Slab One", Georgia, serif`);
  ctx.strokeStyle = '#1f1a0e'; ctx.lineWidth = 10; ctx.strokeText(word, cx, 902);
  ctx.fillStyle = '#f1eee4'; ctx.fillText(word, cx, 902);
}

// ---------------------------------------------------------------- entry points
// Fonts the renderer needs; call before drawing so the canvas does not use
// a fallback font on first paint.
function advLoadFonts() {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  return Promise.all([
    document.fonts.load('400 40px "Alfa Slab One"'),
    document.fonts.load('700 40px Rajdhani'),
    document.fonts.load('700 40px Oswald'),
    document.fonts.load('400 24px Inter'),
    document.fonts.load('700 24px Inter'),
    document.fonts.load('500 24px Inter'),
    document.fonts.load('800 24px Inter'),
  ]).catch(() => {});
}

// data: { kind, style: 'yellow' (default) | 'parchment', title, skills[], successes,
//   passText, failText, scenarioReward, leagueReward, spoilerNote, quote,
//   deck, number, imgZoom, imgX, imgY, sepia }
// img: a loaded HTMLImageElement or null.
// opts.placeholder: false leaves out the "UPLOAD IMAGE" hint (used for saved
// and exported cards, so a card without art prints clean).
function renderAdventureCard(canvas, data, img, opts) {
  opts = opts || {};
  const ctx = canvas.getContext('2d');
  canvas.width = ADV_W; canvas.height = ADV_H;
  ctx.clearRect(0, 0, ADV_W, ADV_H);
  const body = advBody(data);
  advRenderFront(ctx, data, body, img, opts);
}

function renderAdventureBack(canvas, data) {
  const ctx = canvas.getContext('2d');
  canvas.width = ADV_W; canvas.height = ADV_H;
  ctx.clearRect(0, 0, ADV_W, ADV_H);
  const backKind = advBackKind(data.kind);
  if (data.style === 'parchment' || data.style === 'classic') advRenderDecoBack(ctx, backKind, advHash(backKind));
  else advRenderYellowBack(ctx, backKind, advHash(backKind));
}
