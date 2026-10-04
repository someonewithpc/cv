#!/usr/bin/env node
/**
 * Writes src/assets/ornaments/<theme>-<name>.svg, the objects that lie on the desk beside the
 * paper (components/Ornament.astro). Each is drawn here rather than in an editor so the parts
 * that repeat, needles, barbs, pinnae and scales, come from a few numbers, and so every one
 * shares the same light: from above, as the sheets' lift shadow says, with the highlight on
 * the top edge of a thing and the shade under it. The page adds the contact shadow in CSS.
 *
 * Usage: node scripts/draw-ornaments.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'assets', 'ornaments');
mkdirSync(out, { recursive: true });

const r = (n) => Math.round(n * 10) / 10;
const pt = (x, y) => `${r(x)},${r(y)}`;
const stops = (list) => list.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a === undefined ? '' : ` stop-opacity="${a}"`}/>`).join('');
const linear = (id, list, x1 = 0, y1 = 0, x2 = 0, y2 = 1) => `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops(list)}</linearGradient>`;
const radial = (id, list, cx = 0.5, cy = 0.5, rad = 0.5, fx = cx, fy = cy) => `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${rad}" fx="${fx}" fy="${fy}">${stops(list)}</radialGradient>`;
const svg = (w, h, defs, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">\n<defs>${defs}</defs>\n${body}\n</svg>\n`;

/* A point and tangent on a quadratic Bezier, for the things that grow along a stem. */
const quad = (p0, p1, p2) => (t) => {
  const u = 1 - t;
  const x = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0];
  const y = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1];
  const dx = 2 * u * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]);
  const dy = 2 * u * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
  const len = Math.hypot(dx, dy);
  return { x, y, tx: dx / len, ty: dy / len };
};
const rotate = (tx, ty, deg) => {
  const a = (deg * Math.PI) / 180;
  return [tx * Math.cos(a) - ty * Math.sin(a), tx * Math.sin(a) + ty * Math.cos(a)];
};
/* A fixed sequence, so the same file comes out of every run. */
const noise = (seed) => () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

const files = {};

/* Light: a daisy, picked and laid down, head up, stem running down and right. */
files['light-daisy'] = () => {
  const n = 19;
  const petals = Array.from({ length: n }, (_, i) => `<use href="#p" transform="rotate(${r((360 / n) * i + 7)})"/>`).join('');
  return svg(160, 200, [
    linear('dp', [[0, '#ece6d2'], [0.45, '#fbfaf5'], [1, '#ffffff']], 0, 1, 0, 0),
    linear('ds', [[0, '#000', 0], [1, '#5a4410', 0.22]]),
    radial('dc', [[0, '#f8d45c'], [0.6, '#e9ac25'], [1, '#b87a12']], 0.5, 0.5, 0.5, 0.4, 0.3),
    linear('dg', [[0, '#7fa551'], [1, '#4d7230']], 0, 0, 1, 0),
    linear('dl', [[0, '#8db85e'], [1, '#4f7a33']], 0, 0, 1, 1),
    `<path id="p" d="M0,-13 C7,-19 9,-40 0,-57 C-9,-40 -7,-19 0,-13 Z" fill="url(#dp)" stroke="#dcd4bb" stroke-width="0.6"/>`,
    `<mask id="dm"><g transform="translate(80 62)" fill="#fff">${petals.replace(/<use /g, '<use fill="#fff" ')}<circle r="17"/></g></mask>`,
    `<pattern id="dd" width="3.2" height="3.2" patternUnits="userSpaceOnUse"><circle cx="1.6" cy="1.6" r="0.9" fill="#9a6410" opacity="0.5"/></pattern>`,
  ].join(''), [
    `<path d="M82,76 C92,110 104,150 96,194" fill="none" stroke="url(#dg)" stroke-width="4" stroke-linecap="round"/>`,
    `<path d="M96,140 C104,120 128,112 140,118 C132,136 112,146 96,140 Z" fill="url(#dl)"/>`,
    `<path d="M97,139 C112,130 126,122 138,119" fill="none" stroke="#3f6428" stroke-width="0.8" opacity="0.6"/>`,
    `<g transform="translate(80 62)">${petals}</g>`,
    `<rect x="18" y="0" width="124" height="124" fill="url(#ds)" mask="url(#dm)"/>`,
    `<circle cx="80" cy="62" r="16.5" fill="url(#dc)"/>`,
    `<circle cx="80" cy="62" r="13" fill="url(#dd)"/>`,
  ].join('\n'));
};

/* Light: a sharpened HB pencil, lying tip up and to the right. */
files['light-pencil'] = () => svg(160, 232, [
  linear('pe', [[0, '#f6b7b0'], [0.55, '#e48a84'], [1, '#b85f5a']]),
  linear('pf', [[0, '#f2f2f4'], [0.4, '#b9babf'], [0.7, '#e2e2e6'], [1, '#7c7d84']]),
  linear('pb', [[0, '#f9dc63'], [0.34, '#f9dc63'], [0.34, '#f1b826'], [0.67, '#f1b826'], [0.67, '#b57f12'], [1, '#b57f12']]),
  linear('pw', [[0, '#f3dcbb'], [0.5, '#dfb98a'], [1, '#a77c4c']]),
  linear('pt', [[0, '#8c8f94'], [1, '#2c2d31']]),
].join(''), [
  `<g transform="translate(26 218) rotate(-62)">`,
  `<rect x="0" y="-8" width="24" height="16" rx="5" fill="url(#pe)"/>`,
  `<rect x="20" y="-8" width="22" height="16" fill="url(#pf)"/>`,
  `<path d="M25,-8 V8 M31,-8 V8 M37,-8 V8" stroke="#5a5b61" stroke-width="1" opacity="0.6"/>`,
  `<rect x="42" y="-8" width="156" height="16" fill="url(#pb)"/>`,
  `<path d="M198,-8 L224,-2.2 L224,2.2 L198,8 Z" fill="url(#pw)"/>`,
  `<path d="M224,-2.2 L232,0 L224,2.2 Z" fill="url(#pt)"/>`,
  `<path d="M42,-8 H198" stroke="#fff" stroke-width="0.8" opacity="0.45"/>`,
  `<text x="150" y="1.6" font-family="monospace" font-size="4.6" fill="#7a5407" text-anchor="middle" opacity="0.8">HB</text>`,
  `</g>`,
].join('\n'));

/* Light: a scallop shell, hinge down, ribs fanning up. */
files['light-shell'] = () => {
  const ribs = 13;
  const hx = 80; const hy = 136; const R = 86;
  const span = 150; const a0 = -90 - span / 2;
  const edge = [];
  for (let i = 0; i <= ribs; i += 1) {
    const a = ((a0 + (span / ribs) * i) * Math.PI) / 180;
    edge.push([hx + R * Math.cos(a), hy + R * Math.sin(a)]);
  }
  let d = `M${pt(hx - 11, hy - 2)} L${pt(edge[0][0], edge[0][1])}`;
  for (let i = 1; i <= ribs; i += 1) d += ` A9,9 0 0 1 ${pt(edge[i][0], edge[i][1])}`;
  d += ` L${pt(hx + 11, hy - 2)} Z`;
  let lines = '';
  for (let i = 0; i < ribs; i += 1) {
    const a = ((a0 + (span / ribs) * (i + 0.5)) * Math.PI) / 180;
    const ex = hx + (R - 4) * Math.cos(a); const ey = hy + (R - 4) * Math.sin(a);
    lines += `<path d="M${pt(hx, hy - 6)} Q${pt(hx + (ex - hx) * 0.5 - 2, hy + (ey - hy) * 0.5)} ${pt(ex, ey)}" stroke="#fff" stroke-width="2.2" opacity="0.45"/>`;
    lines += `<path d="M${pt(hx + 2, hy - 6)} Q${pt(hx + (ex - hx) * 0.5 + 2, hy + (ey - hy) * 0.5 + 1)} ${pt(ex + 3, ey + 1)}" stroke="#a7724c" stroke-width="2" opacity="0.4"/>`;
  }
  return svg(160, 150, [
    radial('sh', [[0, '#fbeee0'], [0.55, '#f0cfb0'], [1, '#d8a27a']], 0.5, 0.95, 0.9, 0.5, 0.5),
    linear('se', [[0, '#000', 0], [0.7, '#000', 0], [1, '#4a2a10', 0.25]]),
    linear('sg', [[0, '#e8c3a4'], [1, '#b8825a']]),
  ].join(''), [
    `<path d="${d}" fill="url(#sh)" stroke="#b58660" stroke-width="0.7"/>`,
    `<g fill="none" stroke-linecap="round">${lines}</g>`,
    `<path d="${d}" fill="url(#se)"/>`,
    `<path d="M66,130 L94,130 L90,139 L70,139 Z" fill="url(#sg)"/>`,
  ].join('\n'));
};

/* Dark: a brass drawing compass, open, needle leg to the left. */
files['dark-compass'] = () => {
  const knurl = Array.from({ length: 24 }, (_, i) => `<path d="M0,-13.5 V-10.8" transform="rotate(${i * 15})"/>`).join('');
  return svg(160, 240, [
    linear('cb', [[0, '#f2dc93'], [0.3, '#cfa64a'], [0.7, '#9a7126'], [1, '#5b3f12']], 0, 0, 1, 0),
    linear('ch', [[0, '#f6e5a8'], [0.5, '#c59e44'], [1, '#6a4a16']], 0, 0, 0.6, 1),
    linear('cs', [[0, '#eef0f3'], [0.5, '#9aa0a8'], [1, '#4d525a']], 0, 0, 1, 0),
    linear('cl', [[0, '#9a9ca2'], [1, '#2a2b2f']], 0, 0, 1, 0),
    `<path id="leg" d="M-5,0 L5,0 L3.2,170 L-3.2,170 Z" fill="url(#cb)"/>`,
  ].join(''), [
    `<g transform="translate(80 34)">`,
    `<g transform="rotate(14)"><use href="#leg"/><path d="M-3.2,170 L3.2,170 L0,190 Z" fill="url(#cs)"/></g>`,
    `<g transform="rotate(-13)"><use href="#leg"/><rect x="-4.4" y="150" width="8.8" height="22" rx="1.5" fill="url(#cb)" stroke="#4a3410" stroke-width="0.5"/><path d="M-2.4,172 L2.4,172 L0,190 Z" fill="url(#cl)"/></g>`,
    `<path d="M-6,8 H6" stroke="#4a3410" stroke-width="1" opacity="0.5"/>`,
    `<circle r="14" fill="url(#ch)" stroke="#4a3410" stroke-width="0.6"/>`,
    `<g stroke="#5a4012" stroke-width="1" opacity="0.7">${knurl}</g>`,
    `<circle r="5" fill="#8a6520" stroke="#3e2b0a" stroke-width="0.6"/>`,
    `<path d="M-3.4,-3.4 L3.4,3.4" stroke="#2f2007" stroke-width="1.2"/>`,
    `<path d="M-9,-8 A12,12 0 0 1 3,-13" fill="none" stroke="#fff6cf" stroke-width="1.6" opacity="0.6" stroke-linecap="round"/>`,
    `<rect x="-3" y="-30" width="6" height="18" rx="2" fill="url(#cb)" stroke="#4a3410" stroke-width="0.5"/>`,
    `</g>`,
  ].join('\n'));
};

/* Dark: a steel pocket watch, bow up, a few links of chain off to the right. */
files['dark-watch'] = () => {
  const ticks = Array.from({ length: 60 }, (_, i) => (
    i % 5 === 0
      ? `<path d="M0,-44 V-37" stroke="#2b2f3a" stroke-width="2" transform="rotate(${i * 6})"/>`
      : `<path d="M0,-44 V-41" stroke="#2b2f3a" stroke-width="0.8" transform="rotate(${i * 6})"/>`
  )).join('');
  const chain = [[138, 128], [146, 144], [148, 162], [142, 178]].map(([x, y], i) => (
    `<ellipse cx="${x}" cy="${y}" rx="4" ry="7.5" transform="rotate(${-20 + i * 14} ${x} ${y})" fill="none" stroke="url(#wc)" stroke-width="2.2"/>`
  )).join('');
  return svg(160, 190, [
    linear('wc', [[0, '#f0f2f5'], [0.45, '#a3a8b2'], [1, '#4f545e']]),
    linear('wb', [[0, '#5e636c'], [0.5, '#b7bcc5'], [1, '#e7e9ee']]),
    radial('wd', [[0, '#fbf7ea'], [0.75, '#f1e8d1'], [1, '#d9ccab']], 0.5, 0.5, 0.5, 0.4, 0.3),
    linear('wg', [[0, '#fff', 0.5], [0.5, '#fff', 0]], 0, 0, 0.7, 1),
  ].join(''), [
    `<g transform="translate(80 104)">`,
    `<circle r="60" fill="url(#wc)"/>`,
    `<circle r="54" fill="url(#wb)"/>`,
    `<circle r="50" fill="url(#wd)"/>`,
    `<g>${ticks}</g>`,
    `<text y="-26" font-family="serif" font-size="9" fill="#2b2f3a" text-anchor="middle">XII</text>`,
    `<text x="35" y="3" font-family="serif" font-size="9" fill="#2b2f3a" text-anchor="middle">III</text>`,
    `<text y="33" font-family="serif" font-size="9" fill="#2b2f3a" text-anchor="middle">VI</text>`,
    `<text x="-35" y="3" font-family="serif" font-size="9" fill="#2b2f3a" text-anchor="middle">IX</text>`,
    `<circle cy="20" r="11" fill="none" stroke="#7a7466" stroke-width="0.6"/>`,
    `<path d="M0,0 L-22,-14" stroke="#1f3a6e" stroke-width="3.2" stroke-linecap="round"/>`,
    `<path d="M0,0 L16,-36" stroke="#1f3a6e" stroke-width="2.2" stroke-linecap="round"/>`,
    `<path d="M0,20 L5,14" stroke="#1f3a6e" stroke-width="0.8"/>`,
    `<circle r="2.6" fill="#1f3a6e"/>`,
    `<circle r="50" fill="url(#wg)"/>`,
    `<rect x="-6" y="-72" width="12" height="13" rx="2" fill="url(#wc)"/>`,
    `<path d="M-3,-72 V-59 M0,-72 V-59 M3,-72 V-59" stroke="#4f545e" stroke-width="0.8" opacity="0.7"/>`,
    `<circle cy="-82" r="10" fill="none" stroke="url(#wc)" stroke-width="4"/>`,
    `</g>`,
    chain,
  ].join('\n'));
};

/* Dark: a pale moth at rest, wings flat, antennae combed. */
files['dark-moth'] = () => {
  const comb = (side) => Array.from({ length: 14 }, (_, i) => {
    const t = i / 13;
    const x = 100 + side * (2 + 26 * t); const y = 44 - 30 * t;
    const l = 5 - 3 * t;
    return `<path d="M${pt(x, y)} l${pt(side * l * 0.3, -l)}"/>`;
  }).join('');
  return svg(200, 150, [
    linear('mw', [[0, '#f1ece0'], [0.6, '#dbd3c0'], [1, '#b8ad97']]),
    linear('mh', [[0, '#e6dfcd'], [1, '#b2a68e']]),
    linear('mb', [[0, '#8f8470'], [0.5, '#c9bea6'], [1, '#6f6553']], 0, 0, 1, 0),
    `<g id="wing"><path d="M104,54 C140,30 176,28 188,44 C184,72 160,96 130,98 C118,99 108,92 105,80 Z" fill="url(#mw)" stroke="#9c927c" stroke-width="0.7"/>`
    + `<path d="M106,84 C125,102 150,112 140,128 C122,136 108,122 104,108 Z" fill="url(#mh)" stroke="#9c927c" stroke-width="0.7"/>`
    + `<path d="M118,50 C140,46 160,48 176,58" fill="none" stroke="#7d7361" stroke-width="1.4" opacity="0.6"/>`
    + `<path d="M124,74 C142,70 158,74 170,84" fill="none" stroke="#7d7361" stroke-width="2.4" opacity="0.4"/>`
    + `<path d="M130,60 C145,58 158,60 168,66" fill="none" stroke="#6f6553" stroke-width="0.8" opacity="0.5" stroke-dasharray="3 2"/>`
    + `<circle cx="150" cy="66" r="3.4" fill="#4e4638" opacity="0.7"/><circle cx="150" cy="66" r="1.4" fill="#e9e1cf"/>`
    + `<path d="M112,96 C125,106 134,116 132,124" fill="none" stroke="#7d7361" stroke-width="1.2" opacity="0.4"/></g>`,
  ].join(''), [
    `<use href="#wing"/>`,
    `<use href="#wing" transform="translate(200 0) scale(-1 1)"/>`,
    `<ellipse cx="100" cy="92" rx="7" ry="30" fill="url(#mb)"/>`,
    `<path d="M93,80 h14 M93,88 h14 M93,96 h14 M94,104 h12 M95,112 h10" stroke="#5f5544" stroke-width="0.8" opacity="0.45"/>`,
    `<circle cx="100" cy="60" r="11" fill="url(#mb)"/>`,
    `<circle cx="100" cy="60" r="12" fill="none" stroke="#c9bea6" stroke-width="1.6" stroke-dasharray="1 1.4" opacity="0.8"/>`,
    `<circle cx="100" cy="47" r="6" fill="#8a7f6b"/>`,
    `<path d="M100,44 C92,36 80,24 72,14 M100,44 C108,36 120,24 128,14" fill="none" stroke="#6f6553" stroke-width="1.2" stroke-linecap="round"/>`,
    `<g stroke="#6f6553" stroke-width="0.6" opacity="0.8">${comb(-1)}${comb(1)}</g>`,
  ].join('\n'));
};

/* Arctic: a spruce sprig, needles out to both sides, a little frost on it. */
files['arctic-sprig'] = () => {
  const stem = quad([34, 220], [50, 120], [96, 22]);
  const rnd = noise(7);
  let needles = '';
  let frost = '';
  for (let t = 0.06; t < 0.985; t += 0.022) {
    const p = stem(t);
    for (const side of [-1, 1]) {
      const len = 20 + 8 * Math.sin(t * Math.PI) + rnd() * 5 - (t > 0.9 ? (t - 0.9) * 120 : 0);
      const [dx, dy] = rotate(p.tx, p.ty, side * (58 + rnd() * 12));
      const ex = p.x + dx * len; const ey = p.y + dy * len;
      const cx = p.x + dx * len * 0.5 + p.tx * 4; const cy = p.y + dy * len * 0.5 + p.ty * 4;
      needles += `<path d="M${pt(p.x, p.y)} Q${pt(cx, cy)} ${pt(ex, ey)}"/>`;
      if (rnd() > 0.72) frost += `<circle cx="${r(ex - dx * 3)}" cy="${r(ey - dy * 3)}" r="1.1"/>`;
    }
  }
  return svg(130, 230, [
    linear('ss', [[0, '#8a6a4a'], [1, '#4e3826']], 0, 1, 0, 0),
    linear('sn', [[0, '#3f6b5f'], [0.5, '#5d8a7c'], [1, '#86aa9d']], 0, 1, 0, 0),
  ].join(''), [
    `<g fill="none" stroke="url(#sn)" stroke-width="1.7" stroke-linecap="round">${needles}</g>`,
    `<path d="M34,220 Q50,120 96,22" fill="none" stroke="url(#ss)" stroke-width="4.5" stroke-linecap="round"/>`,
    `<path d="M34,220 Q50,120 96,22" fill="none" stroke="#b99a7c" stroke-width="1" opacity="0.5" stroke-dasharray="6 9"/>`,
    `<g fill="#f4fbff" opacity="0.85">${frost}</g>`,
  ].join('\n'));
};

/* Arctic: two river pebbles, one grey, one warmer. */
files['arctic-pebble'] = () => {
  const rnd = noise(3);
  let speck = '';
  for (let i = 0; i < 70; i += 1) {
    const a = rnd() * Math.PI * 2; const d = Math.sqrt(rnd());
    speck += `<circle cx="${r(64 + Math.cos(a) * 44 * d)}" cy="${r(70 + Math.sin(a) * 33 * d)}" r="${r(0.5 + rnd() * 0.8)}"/>`;
  }
  return svg(160, 130, [
    radial('pa', [[0, '#e3e5e9'], [0.5, '#b4b8c0'], [0.85, '#848a95'], [1, '#5d636e']], 0.5, 0.5, 0.62, 0.38, 0.3),
    radial('pq', [[0, '#e0d8ce'], [0.5, '#b7aa9a'], [0.85, '#86796a'], [1, '#5f5446']], 0.5, 0.5, 0.62, 0.38, 0.3),
  ].join(''), [
    `<path d="M22,60 C26,34 52,26 78,32 C104,38 116,56 108,80 C100,104 60,110 38,100 C22,92 18,78 22,60 Z" fill="url(#pa)"/>`,
    `<g fill="#3e434c" opacity="0.28">${speck}</g>`,
    `<path d="M44,54 C60,50 84,52 100,66" fill="none" stroke="#f3f4f6" stroke-width="1.2" opacity="0.5"/>`,
    `<path d="M104,80 C110,66 128,62 142,70 C154,78 152,96 138,102 C122,108 100,100 104,80 Z" fill="url(#pq)"/>`,
    `<path d="M114,78 C122,72 134,72 142,78" fill="none" stroke="#f3eee6" stroke-width="1" opacity="0.5"/>`,
  ].join('\n'));
};

/* Arctic: a white feather, quill down, the vane split in a few places. */
files['arctic-feather'] = () => {
  const shaft = quad([38, 232], [48, 130], [86, 16]);
  const rnd = noise(11);
  let barbs = '';
  let vane = { l: [], r: [] };
  for (let t = 0.2; t < 0.995; t += 0.012) {
    const p = shaft(t);
    const shape = Math.sin(Math.PI * Math.min(1, (t - 0.2) / 0.8) ** 0.6);
    const base = 26 * shape + 4;
    for (const side of [-1, 1]) {
      const len = base * (0.75 + rnd() * 0.3) * (side < 0 ? 1.1 : 0.85);
      const [dx, dy] = rotate(p.tx, p.ty, side * 34);
      const ex = p.x + dx * len; const ey = p.y + dy * len;
      const cx = p.x + dx * len * 0.55 - p.tx * 3; const cy = p.y + dy * len * 0.55 - p.ty * 3;
      barbs += `<path d="M${pt(p.x, p.y)} Q${pt(cx, cy)} ${pt(ex, ey)}"/>`;
      vane[side < 0 ? 'l' : 'r'].push([p.x + dx * len * 0.92, p.y + dy * len * 0.92]);
    }
  }
  const tip = shaft(1);
  const outline = `M${pt(shaft(0.2).x, shaft(0.2).y)} ${vane.l.map(([x, y]) => `L${pt(x, y)}`).join(' ')} L${pt(tip.x, tip.y)} ${vane.r.reverse().map(([x, y]) => `L${pt(x, y)}`).join(' ')} Z`;
  return svg(120, 240, [
    linear('fq', [[0, '#efe9dd'], [1, '#fbfaf7']], 0, 1, 0, 0),
    linear('fb', [[0, '#c7cbd1'], [0.35, '#e9ebee'], [1, '#ffffff']], 0, 1, 0, 0),
  ].join(''), [
    `<path d="${outline}" fill="#f6f6f3" opacity="0.7"/>`,
    `<g fill="none" stroke="url(#fb)" stroke-width="1.1" stroke-linecap="round">${barbs}</g>`,
    `<path d="M36,230 C42,214 40,198 44,186 M42,226 C48,210 46,194 52,180 M40,222 C38,206 44,196 42,182" fill="none" stroke="#d8dbe0" stroke-width="1" stroke-linecap="round" opacity="0.8"/>`,
    `<path d="M38,232 Q48,130 86,16" fill="none" stroke="url(#fq)" stroke-width="3" stroke-linecap="round"/>`,
    `<path d="M38,232 Q48,130 86,16" fill="none" stroke="#cfc8b8" stroke-width="0.8" opacity="0.6"/>`,
  ].join('\n'));
};

/* Forest: a fern frond, Hugo's ask, lobed pinnae either side of a curving rachis. */
files['forest-fern'] = () => {
  const rachis = quad([30, 250], [40, 150], [112, 14]);
  const rnd = noise(5);
  let pinnae = '';
  const pairs = 17;
  for (let i = 0; i < pairs; i += 1) {
    const t = 0.08 + (0.9 * i) / (pairs - 1);
    const p = rachis(t);
    const s = (i + 1) / pairs;
    const len = 50 * Math.sin(Math.PI * (0.12 + 0.88 * s) ** 0.75) * (1 - 0.45 * s) + 6;
    for (const side of [-1, 1]) {
      const ang = side * (62 - 28 * s) + rnd() * 6 - 3;
      const [dx, dy] = rotate(p.tx, p.ty, ang);
      const [nx, ny] = [-dy, dx];
      const lobes = Math.max(3, Math.round(len / 5));
      const edge = (sign) => {
        const pts = [];
        for (let k = 0; k <= lobes * 2; k += 1) {
          const u = k / (lobes * 2);
          const w = (5.5 * (1 - u ** 1.6) + 0.6) * (1 + 0.55 * Math.abs(Math.sin(u * Math.PI * lobes)));
          const bend = Math.sin(u * Math.PI / 2) * 5 * -side;
          pts.push([p.x + dx * len * u + nx * (w * sign + bend), p.y + dy * len * u + ny * (w * sign + bend)]);
        }
        return pts;
      };
      const a = edge(1); const b = edge(-1).reverse();
      const d = `M${pt(a[0][0], a[0][1])} ${a.slice(1).map(([x, y]) => `L${pt(x, y)}`).join(' ')} ${b.map(([x, y]) => `L${pt(x, y)}`).join(' ')} Z`;
      pinnae += `<path d="${d}" fill="url(#${side < 0 ? 'fl' : 'fr'})"/>`;
      pinnae += `<path d="M${pt(p.x, p.y)} L${pt(p.x + dx * len * 0.9, p.y + dy * len * 0.9)}" stroke="#2a4a22" stroke-width="0.7" opacity="0.6"/>`;
    }
  }
  return svg(150, 260, [
    linear('fl', [[0, '#2f5a2a'], [0.5, '#4f8a3e'], [1, '#86b25c']], 0, 1, 1, 0),
    linear('fr', [[0, '#2a4f26'], [0.5, '#447a36'], [1, '#76a352']], 0, 1, 1, 0),
    linear('fs', [[0, '#5a4a26'], [1, '#6e8a3a']], 0, 1, 0, 0),
  ].join(''), [
    `<g stroke-linejoin="round">${pinnae}</g>`,
    `<path d="M30,250 Q40,150 112,14" fill="none" stroke="url(#fs)" stroke-width="3.2" stroke-linecap="round"/>`,
  ].join('\n'));
};

/* Forest: two acorns, one still capped, with an oak leaf. */
files['forest-acorns'] = () => {
  const acorn = (x, y, deg, s) => [
    `<g transform="translate(${x} ${y}) rotate(${deg}) scale(${s})">`,
    `<path d="M-18,-6 C-18,16 -9,30 0,30 C9,30 18,16 18,-6 Z" fill="url(#an)"/>`,
    `<ellipse cy="29" rx="2.2" ry="1.6" fill="#3a2410"/>`,
    `<path d="M-20,-4 C-20,-20 -10,-28 0,-28 C10,-28 20,-20 20,-4 C14,-1 -14,-1 -20,-4 Z" fill="url(#ac)"/>`,
    `<path d="M-20,-4 C-20,-20 -10,-28 0,-28 C10,-28 20,-20 20,-4 C14,-1 -14,-1 -20,-4 Z" fill="url(#as)"/>`,
    `<path d="M-20,-4 C-12,0 12,0 20,-4" fill="none" stroke="#3a2410" stroke-width="1.2"/>`,
    `<path d="M0,-28 C2,-32 6,-36 8,-39" fill="none" stroke="#4a3018" stroke-width="2.4" stroke-linecap="round"/>`,
    `<path d="M-14,-12 C-10,-20 -4,-24 2,-24" fill="none" stroke="#fff3d8" stroke-width="1.4" opacity="0.35" stroke-linecap="round"/>`,
    `</g>`,
  ].join('');
  return svg(160, 150, [
    radial('an', [[0, '#d9a765'], [0.45, '#a86f33'], [0.85, '#6b4017'], [1, '#3f250c']], 0.5, 0.5, 0.6, 0.35, 0.25),
    radial('ac', [[0, '#a98a5e'], [0.6, '#7d6038'], [1, '#4b361a']], 0.5, 0.5, 0.65, 0.4, 0.2),
    `<pattern id="as" width="7" height="5" patternUnits="userSpaceOnUse"><path d="M0,5 Q3.5,-1 7,5" fill="none" stroke="#3a2410" stroke-width="0.8" opacity="0.5"/><path d="M3.5,2.5 Q5.3,0 7,2.5 M0,2.5 Q1.7,0 3.5,2.5" fill="none" stroke="#fff3d8" stroke-width="0.5" opacity="0.25"/></pattern>`,
    linear('al', [[0, '#8a9a4a'], [0.5, '#6d7e34'], [1, '#8f7a3a']], 0, 0, 1, 1),
  ].join(''), [
    `<g transform="translate(96 46) rotate(-118)"><path d="M0,-38 C8,-36 10,-28 6,-24 C14,-24 18,-16 12,-10 C20,-8 20,2 12,4 C18,10 14,20 6,18 C8,26 2,32 -2,30 C-8,34 -14,26 -10,20 C-18,22 -22,14 -16,8 C-24,4 -22,-6 -14,-8 C-20,-14 -16,-24 -8,-22 C-10,-30 -6,-38 0,-38 Z" fill="url(#al)" stroke="#5a6428" stroke-width="0.6"/>`,
    `<path d="M0,-36 L-1,30" stroke="#4e5a22" stroke-width="0.9" opacity="0.7"/><path d="M-0.5,-22 L7,-26 M-0.5,-10 L11,-13 M-0.5,2 L10,2 M-0.5,14 L6,16 M-0.5,-16 L-12,-20 M-0.5,-4 L-14,-6 M-0.5,8 L-12,10 M-0.5,20 L-8,24" stroke="#4e5a22" stroke-width="0.5" opacity="0.6"/></g>`,
    acorn(58, 96, -22, 1),
    acorn(112, 100, 18, 0.86),
  ].join('\n'));
};

/* Forest: a pine cone on its side, stalk end to the left. */
files['forest-pinecone'] = () => {
  let scales = '';
  const rnd = noise(9);
  const cols = 9;
  for (let c = cols - 1; c >= 0; c -= 1) {
    const u = c / (cols - 1);
    const x = 30 + u * 112;
    const h = 44 * Math.sin(Math.PI * (0.18 + 0.82 * u) ** 0.7) * (1 - 0.3 * u) + 6;
    const rows = Math.max(2, Math.round(h / 9));
    for (let k = 0; k <= rows; k += 1) {
      const v = rows === 0 ? 0 : (k / rows) * 2 - 1;
      const y = 60 + v * h * 0.9 + (c % 2) * 4;
      const tilt = v * 26;
      const sh = 0.35 + 0.65 * (1 - Math.abs(v)) ** 0.5;
      scales += `<path d="M-10,0 C-9,-7 -2,-9 8,-6 C13,-4 16,-1 18,0 C16,1 13,4 8,6 C-2,9 -9,7 -10,0 Z" transform="translate(${r(x)} ${r(y)}) rotate(${r(tilt + rnd() * 6 - 3)})" fill="url(#ps)" opacity="${r(sh)}" stroke="#2e1a08" stroke-width="0.6"/>`;
    }
  }
  return svg(160, 120, [
    linear('ps', [[0, '#3b2410'], [0.5, '#8a5a30'], [0.85, '#c9935a'], [1, '#e8be8a']], 0, 0, 1, 0),
    linear('pk', [[0, '#5a3a1a'], [1, '#2e1a08']], 0, 0, 0, 1),
    `<clipPath id="pc"><path d="M18,60 C22,30 52,14 88,14 C126,14 154,36 156,60 C154,84 126,106 88,106 C52,106 22,90 18,60 Z"/></clipPath>`,
  ].join(''), [
    `<path d="M18,60 C22,30 52,14 88,14 C126,14 154,36 156,60 C154,84 126,106 88,106 C52,106 22,90 18,60 Z" fill="#2e1a08"/>`,
    `<g clip-path="url(#pc)">${scales}</g>`,
    `<path d="M20,60 C14,58 8,58 4,60" fill="none" stroke="url(#pk)" stroke-width="4" stroke-linecap="round"/>`,
  ].join('\n'));
};

for (const [name, draw] of Object.entries(files)) {
  const text = draw();
  writeFileSync(join(out, `${name}.svg`), text);
  console.log(`${name}.svg ${text.length} bytes`);
}
