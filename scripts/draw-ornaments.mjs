#!/usr/bin/env node
/**
 * Writes src/assets/ornaments/<theme>-<name>.svg, the things that lie on the desk round the
 * paper (components/Ornament.astro places them; ornaments.ts says where). Each is drawn here
 * rather than in an editor so the parts that repeat, needles, pinnae and scales, come from a
 * few numbers, and so every one shares the same light: from above, as the sheets' lift shadow
 * says, with the highlight on the top edge of a thing and the shade under it. The page adds
 * the contact shadow in CSS.
 *
 * Nothing here is symmetric on purpose. Every outline is jittered, lengths vary, and each
 * object carries the marks of having been handled: a chewed pencil end, a scratched watch
 * case, a cap off an acorn. The noise is a fixed sequence, so a run writes the same files.
 *
 * Usage: node scripts/draw-ornaments.mjs
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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

/* A fixed sequence, so the same file comes out of every run. */
const noise = (seed) => () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};
const between = (rnd, a, b) => a + (b - a) * rnd();

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

/* A closed smooth path through points, each nudged by up to `amp`: the outline of anything
   that was never a perfect shape. */
const blob = (points, amp, rnd) => {
  const p = points.map(([x, y]) => [x + between(rnd, -amp, amp), y + between(rnd, -amp, amp)]);
  const n = p.length;
  const mid = (i) => [(p[i][0] + p[(i + 1) % n][0]) / 2, (p[i][1] + p[(i + 1) % n][1]) / 2];
  let d = `M${pt(...mid(n - 1))}`;
  for (let i = 0; i < n; i += 1) d += ` Q${pt(...p[i])} ${pt(...mid(i))}`;
  return `${d} Z`;
};
/* Points round an ellipse, for blob(). */
const ring = (cx, cy, rx, ry, n, phase = 0) => Array.from({ length: n }, (_, i) => {
  const a = phase + (i / n) * Math.PI * 2;
  return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
});
/* Short pale lines, the scuffs a thing picks up. */
const scuffs = (rnd, cx, cy, spread, count, color, opacity = 0.35) => Array.from({ length: count }, () => {
  const x = cx + between(rnd, -spread, spread); const y = cy + between(rnd, -spread, spread);
  const a = between(rnd, 0, Math.PI); const l = between(rnd, 2, 7);
  return `<path d="M${pt(x, y)} l${pt(Math.cos(a) * l, Math.sin(a) * l)}" stroke="${color}" stroke-width="${r(between(rnd, 0.4, 0.9))}" opacity="${r(opacity * between(rnd, 0.6, 1))}"/>`;
}).join('');
/* Translucent patches of a second tone, so a surface is not one flat gradient. */
const blotches = (rnd, cx, cy, spread, count, color, opacity = 0.14) => Array.from({ length: count }, () => (
  `<path d="${blob(ring(cx + between(rnd, -spread, spread), cy + between(rnd, -spread, spread), between(rnd, 3, 8), between(rnd, 2, 6), 6, between(rnd, 0, 3)), 1.2, rnd)}" fill="${color}" opacity="${r(opacity * between(rnd, 0.6, 1.2))}"/>`
)).join('');

const files = {};

/* Light: a daisy, picked and pressed in a pocket. Petals of uneven length, one missing, two
   folded over; the stem has a kink where it was snapped off. */
files['light-daisy'] = () => {
  const rnd = noise(21);
  const n = 20;
  let petals = '';
  for (let i = 0; i < n; i += 1) {
    if (i === 13) continue;
    const a = (360 / n) * i + between(rnd, -5, 5);
    const len = between(rnd, 0.72, 1.08) * (i === 5 || i === 16 ? 0.62 : 1);
    const w = between(rnd, 0.8, 1.15);
    const tip = between(rnd, -3, 3);
    const d = `M0,-12 C${r(7 * w)},-18 ${r(9 * w + tip)},${r(-40 * len)} ${r(tip)},${r(-56 * len)} C${r(-9 * w + tip)},${r(-40 * len)} ${r(-7 * w)},-18 0,-12 Z`;
    const fold = i === 2 || i === 9;
    petals += `<path d="${d}" transform="rotate(${r(a)})${fold ? ' scale(1 0.6)' : ''}" fill="url(#dp)" stroke="#d9d1b6" stroke-width="0.6"/>`;
    if (fold) petals += `<path d="M0,-12 C${r(5 * w)},-16 ${r(6 * w)},-26 0,-33 C${r(-6 * w)},-26 ${r(-5 * w)},-16 0,-12 Z" transform="rotate(${r(a)})" fill="#e7e1cc" opacity="0.7"/>`;
  }
  return svg(160, 200, [
    linear('dp', [[0, '#e9e2cc'], [0.45, '#faf8f0'], [1, '#fffefb']], 0, 1, 0, 0),
    linear('ds', [[0, '#000', 0], [1, '#5a4410', 0.22]]),
    radial('dc', [[0, '#f3cf58'], [0.6, '#e2a523'], [1, '#a66d10']], 0.5, 0.5, 0.5, 0.42, 0.32),
    linear('dg', [[0, '#86a856'], [1, '#4b6d2f']], 0, 0, 1, 0),
    linear('dl', [[0, '#93b864'], [1, '#4f7633']], 0, 0, 1, 1),
    `<mask id="dm"><g transform="translate(78 64)" fill="#fff">${petals.replace(/fill="url\(#dp\)"/g, 'fill="#fff"')}<circle r="17"/></g></mask>`,
    `<pattern id="dd" width="3.4" height="3.1" patternUnits="userSpaceOnUse"><circle cx="1.7" cy="1.5" r="0.9" fill="#8f5c0e" opacity="0.5"/></pattern>`,
  ].join(''), [
    `<path d="M80,78 C88,100 102,118 98,142 C96,152 90,160 94,172 C96,182 100,190 98,196" fill="none" stroke="url(#dg)" stroke-width="4.2" stroke-linecap="round"/>`,
    `<path d="M98,142 C96,152 90,160 94,172" fill="none" stroke="#3d5a24" stroke-width="1.2" opacity="0.5"/>`,
    `<path d="${blob([[97, 150], [108, 136], [124, 126], [140, 128], [138, 140], [122, 152], [106, 154]], 2, rnd)}" fill="url(#dl)"/>`,
    `<path d="M99,149 C112,140 126,132 138,129" fill="none" stroke="#3f6428" stroke-width="0.8" opacity="0.6"/>`,
    `<path d="M126,127 L130,134 L122,133 Z" fill="#e8c9a0" opacity="0.9"/>`,
    `<g transform="translate(78 64)">${petals}</g>`,
    `<rect x="12" y="0" width="132" height="128" fill="url(#ds)" mask="url(#dm)"/>`,
    `<path d="${blob(ring(79, 65, 16.5, 15.5, 9, 0.4), 0.8, rnd)}" fill="url(#dc)"/>`,
    `<path d="${blob(ring(79, 65, 13, 12, 8, 1), 0.6, rnd)}" fill="url(#dd)"/>`,
    blotches(rnd, 79, 65, 8, 3, '#7a4a08', 0.18),
  ].join('\n'));
};

/* Light: a pencil that has been in someone's mouth. The eraser is worn to a slant, the ferrule
   has a dent, the paint is bitten through near it, and the lead is blunt. */
files['light-pencil'] = () => {
  const rnd = noise(33);
  const bites = Array.from({ length: 9 }, () => {
    const x = between(rnd, 44, 92); const y = between(rnd, -7, 7);
    return `<path d="${blob(ring(x, y, between(rnd, 1.5, 3), between(rnd, 1, 2.2), 6), 0.5, rnd)}" fill="#6b4a12" opacity="${r(between(rnd, 0.25, 0.5))}"/>`;
  }).join('');
  return svg(160, 232, [
    linear('pe', [[0, '#f0b1aa'], [0.55, '#d9847e'], [1, '#a9585a']]),
    linear('pf', [[0, '#e9e9eb'], [0.4, '#aaabb0'], [0.7, '#d4d4d8'], [1, '#6f7077']]),
    linear('pb', [[0, '#f3d55e'], [0.34, '#f3d55e'], [0.34, '#e9b124'], [0.67, '#e9b124'], [0.67, '#ad7a12'], [1, '#ad7a12']]),
    linear('pw', [[0, '#efd6b4'], [0.5, '#d6b082'], [1, '#9c7247']]),
    linear('pt', [[0, '#7c7f84'], [1, '#26272b']]),
    `<clipPath id="pcb"><path d="M42,-8 H190 L188,8 H42 Z"/></clipPath>`,
  ].join(''), [
    `<g transform="translate(28 216) rotate(-58)">`,
    `<path d="M4,-8 L24,-8 L24,8 L1,8 C-2,6 -1,-5 4,-8 Z" fill="url(#pe)"/>`,
    `<path d="M2,-4 L12,-6 M3,3 L14,5" stroke="#8a4a4c" stroke-width="0.8" opacity="0.5"/>`,
    `<path d="M20,-8 H42 V8 H20 Z" fill="url(#pf)"/>`,
    `<path d="M26,-8 V8 M32,-8 V8 M38,-8 V8" stroke="#5a5b61" stroke-width="1" opacity="0.6"/>`,
    `<path d="M29,-8 C31,-5 33,-5 35,-8" fill="#5a5b61" opacity="0.6"/>`,
    `<path d="M42,-8 H190 L188,8 H42 Z" fill="url(#pb)"/>`,
    `<g clip-path="url(#pcb)">${bites}${scuffs(rnd, 120, 0, 60, 8, '#fff7d8', 0.5)}</g>`,
    `<path d="M112,-8 C116,-3 120,-5 124,-8 Z" fill="#d7b886"/>`,
    `<path d="M42,-8 H190" stroke="#fff" stroke-width="0.8" opacity="0.4"/>`,
    `<path d="M190,-8 L214,-3 L213,2.6 L188,8 Z" fill="url(#pw)"/>`,
    `<path d="M196,-6 C200,-2 204,-5 208,-3 M194,5 C200,2 206,4 210,1" fill="none" stroke="#7a5230" stroke-width="0.6" opacity="0.5"/>`,
    `<path d="M213,-3 L219,-1 L219,1.5 L213,2.6 Z" fill="url(#pt)"/>`,
    `<text x="150" y="1.6" font-family="monospace" font-size="4.6" fill="#7a5407" text-anchor="middle" opacity="0.7">HB</text>`,
    `</g>`,
  ].join('\n'));
};

/* Light: a paperclip, one loop bent out where it was used to open something. */
files['light-paperclip'] = () => {
  const rnd = noise(45);
  const w = (d) => d.replace(/(-?\d+\.?\d*),(-?\d+\.?\d*)/g, (_, x, y) => pt(+x + between(rnd, -0.8, 0.8), +y + between(rnd, -0.8, 0.8)));
  const d = w('M28,22 C28,10 20,8 14,10 C8,12 8,22 8,30 L8,118 C8,128 14,134 22,134 C30,134 36,128 36,118 L36,40 C36,30 30,26 24,28 C18,30 18,36 18,42 L20,108 C20,114 24,116 28,116 C32,116 36,112 36,106');
  return svg(60, 150, [
    linear('cm', [[0, '#f4f5f7'], [0.35, '#b7bac1'], [0.7, '#e4e6ea'], [1, '#6f737b']], 0, 0, 1, 0.3),
  ].join(''), [
    `<path d="${d}" fill="none" stroke="#3a3d44" stroke-width="4.2" stroke-linecap="round" opacity="0.35"/>`,
    `<path d="${d}" fill="none" stroke="url(#cm)" stroke-width="3.2" stroke-linecap="round"/>`,
    `<path d="M22,134 C30,134 36,128 36,118 L36,106" fill="none" stroke="#9a9ea6" stroke-width="3.2" stroke-linecap="round" opacity="0.4"/>`,
    scuffs(rnd, 22, 70, 20, 5, '#fff', 0.6),
  ].join('\n'));
};

/* Dark: a brass drawing compass that has done years of work: tarnished in patches, scuffed,
   the needle bent a few degrees off the leg. */
files['dark-compass'] = () => {
  const rnd = noise(57);
  const knurl = Array.from({ length: 24 }, (_, i) => (i === 7 || i === 8 ? '' : `<path d="M0,-13.5 V-10.8" transform="rotate(${r(i * 15 + between(rnd, -2, 2))})"/>`)).join('');
  const leg = (deg, extra) => [
    `<g transform="rotate(${deg})">`,
    `<path d="M-5,0 L5,0 L3.6,96 L3.1,170 L-3.1,170 L-3.6,96 Z" fill="url(#cb)"/>`,
    `<g clip-path="url(#ccl)">${blotches(rnd, 0, 90, 60, 6, '#3a2608', 0.3)}${scuffs(rnd, 0, 100, 70, 7, '#fff2c0', 0.4)}</g>`,
    extra,
    `</g>`,
  ].join('');
  return svg(160, 240, [
    linear('cb', [[0, '#ead07f'], [0.3, '#c69c3f'], [0.7, '#8f681f'], [1, '#4f360e']], 0, 0, 1, 0),
    linear('ch', [[0, '#f0dc9a'], [0.5, '#bb943c'], [1, '#5e4012']], 0, 0, 0.6, 1),
    linear('cs', [[0, '#e3e6ea'], [0.5, '#8d939b'], [1, '#43484f']], 0, 0, 1, 0),
    linear('cl', [[0, '#8d8f95'], [1, '#232428']], 0, 0, 1, 0),
    `<clipPath id="cch"><circle r="13.5"/></clipPath>`,
    `<clipPath id="ccl"><path d="M-5,0 L5,0 L3.6,96 L3.1,170 L-3.1,170 L-3.6,96 Z"/></clipPath>`,
  ].join(''), [
    `<g transform="translate(80 34)">`,
    leg(15, `<path d="M-3.1,170 L3.1,170 L1.6,190 Z" fill="url(#cs)" transform="rotate(4 0 170)"/>`),
    leg(-12, `<path d="M-4.4,150 h8.8 v22 h-8.8 Z" fill="url(#cb)" stroke="#4a3410" stroke-width="0.5" transform="rotate(-2 0 160)"/><path d="M-2.4,172 L2.4,172 L0.6,189 Z" fill="url(#cl)"/>`),
    `<path d="M-6,8 H6" stroke="#4a3410" stroke-width="1" opacity="0.5"/>`,
    `<path d="${blob(ring(0, 0, 14, 14, 10), 0.5, rnd)}" fill="url(#ch)" stroke="#4a3410" stroke-width="0.6"/>`,
    `<g stroke="#5a4012" stroke-width="1" opacity="0.7">${knurl}</g>`,
    `<g clip-path="url(#cch)">${blotches(rnd, 0, 0, 8, 3, '#3a2608', 0.3)}</g>`,
    `<circle cx="0.8" cy="-0.4" r="5" fill="#86621f" stroke="#3e2b0a" stroke-width="0.6"/>`,
    `<path d="M-2.6,-3.8 L4.2,3" stroke="#2f2007" stroke-width="1.2"/>`,
    `<path d="M-9,-8 A12,12 0 0 1 3,-13" fill="none" stroke="#fff6cf" stroke-width="1.6" opacity="0.5" stroke-linecap="round"/>`,
    `<path d="M-3,-30 h6 v18 h-6 Z" fill="url(#cb)" stroke="#4a3410" stroke-width="0.5" transform="rotate(3 0 -20)"/>`,
    `</g>`,
  ].join('\n'));
};

/* Dark: a steel pocket watch, its lid left a little open, the case scratched from a pocket
   full of keys, the dial yellowed at one edge. */
files['dark-watch'] = () => {
  const rnd = noise(69);
  const ticks = Array.from({ length: 60 }, (_, i) => (
    i % 5 === 0
      ? `<path d="M0,-44 V-37" stroke="#2b2f3a" stroke-width="2" transform="rotate(${i * 6})"/>`
      : `<path d="M0,-44 V-41" stroke="#2b2f3a" stroke-width="0.8" transform="rotate(${i * 6})"/>`
  )).join('');
  const chain = [[148, 126], [157, 142], [156, 160], [148, 175], [136, 184]].map(([x, y], i) => (
    `<ellipse cx="${x}" cy="${y}" rx="4" ry="7.5" transform="rotate(${r(-20 + i * 16 + between(rnd, -10, 10))} ${x} ${y})" fill="none" stroke="url(#wc)" stroke-width="2.2"/>`
  )).join('');
  return svg(180, 190, [
    linear('wc', [[0, '#eceef1'], [0.45, '#9ba0aa'], [1, '#474c56']]),
    linear('wb', [[0, '#575c66'], [0.5, '#afb4bd'], [1, '#e2e4e9']]),
    radial('wd', [[0, '#fbf7ea'], [0.75, '#efe5cc'], [1, '#d3c4a0']], 0.5, 0.5, 0.5, 0.4, 0.3),
    linear('wg', [[0, '#fff', 0.45], [0.5, '#fff', 0]], 0, 0, 0.7, 1),
    linear('wl', [[0, '#d9dce2'], [0.5, '#8e939d'], [1, '#3f444d']], 0, 0, 1, 1),
    `<clipPath id="wcc"><circle r="60"/></clipPath>`,
  ].join(''), [
    `<g transform="translate(96 104)">`,
    `<ellipse cx="-66" rx="17" ry="58" fill="url(#wl)" stroke="#2f333b" stroke-width="0.6" transform="rotate(-3 -66 0)"/>`,
    `<ellipse cx="-68" rx="9" ry="50" fill="#c9cdd4" opacity="0.6" transform="rotate(-3 -66 0)"/>`,
    `<path d="M-60,-10 h4 v20 h-4 Z" fill="#5c6069"/>`,
    `<circle r="60" fill="url(#wc)"/>`,
    `<circle r="54" fill="url(#wb)"/>`,
    `<circle r="50" fill="url(#wd)"/>`,
    `<path d="${blob(ring(26, 30, 22, 14, 7), 2, rnd)}" fill="#b89a5a" opacity="0.18"/>`,
    `<g>${ticks}</g>`,
    `<text y="-26" font-family="serif" font-size="9" fill="#2b2f3a" text-anchor="middle">XII</text>`,
    `<text x="35" y="3" font-family="serif" font-size="9" fill="#2b2f3a" text-anchor="middle">III</text>`,
    `<text y="33" font-family="serif" font-size="9" fill="#2b2f3a" text-anchor="middle">VI</text>`,
    `<text x="-35" y="3" font-family="serif" font-size="9" fill="#2b2f3a" text-anchor="middle">IX</text>`,
    `<circle cy="20" r="11" fill="none" stroke="#7a7466" stroke-width="0.6"/>`,
    `<path d="M0,0 L-21,-16" stroke="#1f3a6e" stroke-width="3.2" stroke-linecap="round"/>`,
    `<path d="M0,0 L18,-35" stroke="#1f3a6e" stroke-width="2.2" stroke-linecap="round"/>`,
    `<path d="M0,20 L6,13" stroke="#1f3a6e" stroke-width="0.8"/>`,
    `<circle r="2.6" fill="#1f3a6e"/>`,
    `<circle r="50" fill="url(#wg)"/>`,
    `<path d="M-30,-70 C-10,-66 20,-72 44,-50 M20,56 C34,46 44,30 48,22" fill="none" stroke="#fff" stroke-width="0.7" opacity="0.5"/>`,
    `<g clip-path="url(#wcc)">${scuffs(rnd, 0, 0, 56, 14, '#f5f6f8', 0.5)}</g>`,
    `<path d="M-6,-72 h12 v13 h-12 Z" fill="url(#wc)" transform="rotate(-4 0 -66)"/>`,
    `<path d="M-3,-72 V-59 M0,-72 V-59 M3,-72 V-59" stroke="#4f545e" stroke-width="0.8" opacity="0.7" transform="rotate(-4 0 -66)"/>`,
    `<ellipse cy="-82" rx="10" ry="9" fill="none" stroke="url(#wc)" stroke-width="4" transform="rotate(-10 0 -82)"/>`,
    `</g>`,
    chain,
  ].join('\n'));
};

/* Dark: a struck match, the head burnt to a crust, the stick charred a third of the way and
   bent where the burn weakened it. */
files['dark-matchstick'] = () => {
  const rnd = noise(81);
  return svg(40, 160, [
    linear('ms', [[0, '#1d1a17'], [0.3, '#3d2f22'], [0.45, '#8a6a46'], [1, '#d9b98a']]),
    linear('mx', [[0, '#eed9b4', 0.5], [1, '#5a4530', 0.5]], 0, 0, 1, 0),
    `<clipPath id="msc"><path d="M16,36 C14,60 18,90 15,120 C14,135 16,146 17,154 L23,154 C22,146 21,135 22,120 C24,90 20,60 23,38 Z"/></clipPath>`,
  ].join(''), [
    `<path d="M16,36 C14,60 18,90 15,120 C14,135 16,146 17,154 L23,154 C22,146 21,135 22,120 C24,90 20,60 23,38 Z" fill="url(#ms)"/>`,
    `<path d="M16,36 C14,60 18,90 15,120 C14,135 16,146 17,154 L23,154 C22,146 21,135 22,120 C24,90 20,60 23,38 Z" fill="url(#mx)"/>`,
    `<path d="M15,44 C17,52 18,58 17,66 M22,48 C21,56 22,62 21,70" fill="none" stroke="#000" stroke-width="0.5" opacity="0.5"/>`,
    `<path d="${blob([[13, 36], [15, 24], [20, 14], [27, 12], [31, 20], [29, 32], [24, 40]], 1.8, rnd)}" fill="#1a1512"/>`,
    `<path d="${blob(ring(23, 24, 5, 7, 7), 1.2, rnd)}" fill="#4a4340" opacity="0.8"/>`,
    `<path d="${blob(ring(26, 20, 3, 3, 6), 0.8, rnd)}" fill="#8d8683" opacity="0.6"/>`,
    `<g clip-path="url(#msc)">${blotches(rnd, 19, 90, 30, 4, '#5a3a1a', 0.25)}</g>`,
    `<path d="M17,154 C18,157 22,157 23,154" fill="#b89a6e"/>`,
  ].join('\n'));
};

/* Arctic: a spruce sprig, needles of every length, some missing, a few dropped beside it,
   the stem snapped at the thick end. */
files['arctic-sprig'] = () => {
  const stem = quad([34, 220], [50, 120], [96, 22]);
  const rnd = noise(93);
  let needles = '';
  let frost = '';
  for (let t = 0.06; t < 0.985; t += 0.021) {
    const p = stem(t);
    for (const side of [-1, 1]) {
      if (rnd() < 0.1) continue;
      const len = (20 + 8 * Math.sin(t * Math.PI)) * between(rnd, 0.55, 1.2) - (t > 0.9 ? (t - 0.9) * 120 : 0);
      const [dx, dy] = rotate(p.tx, p.ty, side * between(rnd, 48, 76));
      const bend = between(rnd, -6, 6);
      const ex = p.x + dx * len; const ey = p.y + dy * len;
      const cx = p.x + dx * len * 0.5 + p.tx * 4 - dy * bend; const cy = p.y + dy * len * 0.5 + p.ty * 4 + dx * bend;
      needles += `<path d="M${pt(p.x, p.y)} Q${pt(cx, cy)} ${pt(ex, ey)}"${rnd() < 0.12 ? ' stroke="#8a9a6e"' : ''}/>`;
      if (rnd() > 0.8) frost += `<circle cx="${r(ex - dx * 3)}" cy="${r(ey - dy * 3)}" r="${r(between(rnd, 0.7, 1.3))}"/>`;
    }
  }
  const dropped = [[18, 190, -40, 14], [26, 206, 20, 18], [62, 214, -70, 16], [108, 196, 30, 12], [12, 160, 80, 15]].map(([x, y, a, l]) => {
    const [dx, dy] = rotate(1, 0, a);
    return `<path d="M${pt(x, y)} q${pt(dx * l * 0.5 - dy * 2, dy * l * 0.5 + dx * 2)} ${pt(dx * l, dy * l)}"/>`;
  }).join('');
  return svg(130, 230, [
    linear('ss', [[0, '#7f6245'], [1, '#4a3524']], 0, 1, 0, 0),
    linear('sn', [[0, '#3b6659'], [0.5, '#5a8676'], [1, '#82a697']], 0, 1, 0, 0),
  ].join(''), [
    `<g fill="none" stroke="url(#sn)" stroke-width="1.7" stroke-linecap="round">${needles}</g>`,
    `<g fill="none" stroke="#5f8878" stroke-width="1.5" stroke-linecap="round" opacity="0.8">${dropped}</g>`,
    `<path d="M34,220 Q50,120 96,22" fill="none" stroke="url(#ss)" stroke-width="4.5" stroke-linecap="butt"/>`,
    `<path d="M31,220 L37,222 L35,217 Z" fill="#c9b08f"/>`,
    `<path d="M34,220 Q50,120 96,22" fill="none" stroke="#b99a7c" stroke-width="1" opacity="0.5" stroke-dasharray="6 9"/>`,
    `<g fill="#f4fbff" opacity="0.85">${frost}</g>`,
  ].join('\n'));
};

/* Arctic: a torn tram ticket, creased once across, the stub end ripped off. */
files['arctic-ticket'] = () => {
  const rnd = noise(105);
  const tear = [];
  for (let y = 10; y <= 80; y += 5) tear.push([between(rnd, 118, 128), y]);
  const outline = `M14,10 L118,10 ${tear.map(([x, y]) => `L${pt(x, y)}`).join(' ')} L14,80 Z`;
  return svg(140, 90, [
    linear('tp', [[0, '#f2f0ea'], [0.5, '#e4e1d8'], [0.5, '#dcd8ce'], [1, '#ecebe4']], 0, 0, 1, 0.2),
    `<pattern id="tt" width="4" height="4" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.1" fill="#8aa2b8" opacity="0.5"/></pattern>`,
  ].join(''), [
    `<g transform="rotate(-6 70 45)">`,
    `<path d="${outline}" fill="url(#tp)" stroke="#b9b5aa" stroke-width="0.5"/>`,
    `<path d="M14,10 L26,30 L14,80" fill="none" stroke="#b5b1a6" stroke-width="0.5" opacity="0.6"/>`,
    `<path d="M68,10 L74,80" fill="none" stroke="#7d8a96" stroke-width="0.7" opacity="0.5"/>`,
    `<path d="M22,18 h40 M22,24 h30 M22,34 h46 M22,40 h18 M22,56 h38 M22,62 h24" stroke="#4d6b88" stroke-width="2" opacity="0.75"/>`,
    `<text x="24" y="74" font-family="monospace" font-size="7" fill="#2f4b66" opacity="0.8">0417</text>`,
    `<path d="M84,18 h26 M84,26 h20 M84,34 h28 M84,42 h14" stroke="#4d6b88" stroke-width="2" opacity="0.55"/>`,
    `<rect x="84" y="52" width="30" height="20" fill="url(#tt)"/>`,
    `<path d="M14,12 L118,12" stroke="#6c7f94" stroke-width="1.5" opacity="0.5" stroke-dasharray="3 2"/>`,
    blotches(rnd, 60, 50, 40, 5, '#9a8a66', 0.12),
    `</g>`,
  ].join('\n'));
};

/* Arctic: a small steel key, tarnished, the bow ring bent out of round. */
files['arctic-key'] = () => {
  const rnd = noise(117);
  return svg(60, 140, [
    linear('km', [[0, '#e8ebef'], [0.4, '#a2a8b1'], [0.7, '#d2d6dc'], [1, '#5b616b']], 0, 0, 1, 0.4),
    `<clipPath id="kc"><ellipse cx="30" cy="24" rx="15" ry="13"/><path d="M26,36 L34,36 L33,112 L27,112 Z"/><path d="M33,96 h10 v5 h-7 v4 h9 v6 h-12 Z"/></clipPath>`,
  ].join(''), [
    `<g transform="rotate(5 30 70)">`,
    `<path d="${blob(ring(30, 24, 15, 13, 10, 0.3), 1.2, rnd)}" fill="url(#km)"/>`,
    `<path d="${blob(ring(30, 24, 7, 6, 8, 0.6), 0.7, rnd)}" fill="#1b1c20" opacity="0.85"/>`,
    `<path d="M26,36 L34,36 L33,112 L27,112 Z" fill="url(#km)"/>`,
    `<path d="M33,96 h10 v5 h-7 v4 h9 v6 h-12 Z" fill="url(#km)"/>`,
    `<path d="M27,40 h6" stroke="#2c2e33" stroke-width="1" opacity="0.5"/>`,
    `<g clip-path="url(#kc)">${blotches(rnd, 30, 70, 30, 6, '#3a3222', 0.3)}${scuffs(rnd, 30, 60, 20, 6, '#fff', 0.5)}</g>`,
    `<path d="M27,112 L33,112 L31,118 L29,118 Z" fill="#8a8f98"/>`,
    `</g>`,
  ].join('\n'));
};

/* Forest: Hugo's fern, picked and carried: pinnae of unequal length on the two sides, a few
   missing, two browned at the base, the tip beginning to curl. */
files['forest-fern'] = () => {
  const rachis = quad([30, 250], [40, 150], [112, 14]);
  const rnd = noise(129);
  let pinnae = '';
  const pairs = 18;
  for (let i = 0; i < pairs; i += 1) {
    const t = 0.07 + (0.9 * i) / (pairs - 1);
    const p = rachis(t);
    const s = (i + 1) / pairs;
    const base = 50 * Math.sin(Math.PI * (0.12 + 0.88 * s) ** 0.75) * (1 - 0.45 * s) + 6;
    for (const side of [-1, 1]) {
      if ((i === 4 && side === 1) || (i === 11 && side === -1)) continue;
      const len = base * between(rnd, 0.7, 1.12) * (side < 0 ? 1.08 : 0.92);
      const ang = side * (62 - 28 * s) + between(rnd, -9, 9);
      const [dx, dy] = rotate(p.tx, p.ty, ang);
      const [nx, ny] = [-dy, dx];
      const lobes = Math.max(3, Math.round(len / 5));
      const curl = between(rnd, -8, 8) * -side;
      const edge = (sign) => {
        const pts = [];
        for (let k = 0; k <= lobes * 2; k += 1) {
          const u = k / (lobes * 2);
          const w = (5.5 * (1 - u ** 1.6) + 0.6) * (1 + 0.55 * Math.abs(Math.sin(u * Math.PI * lobes))) * between(rnd, 0.85, 1.15);
          const bend = Math.sin(u * Math.PI / 2) * curl;
          pts.push([p.x + dx * len * u + nx * (w * sign + bend), p.y + dy * len * u + ny * (w * sign + bend)]);
        }
        return pts;
      };
      const a = edge(1); const b = edge(-1).reverse();
      const d = `M${pt(a[0][0], a[0][1])} ${a.slice(1).map(([x, y]) => `L${pt(x, y)}`).join(' ')} ${b.map(([x, y]) => `L${pt(x, y)}`).join(' ')} Z`;
      const brown = (i < 2 && side === 1) || (i === 6 && side === -1);
      pinnae += `<path d="${d}" fill="url(#${brown ? 'fb' : side < 0 ? 'fl' : 'fr'})"/>`;
      pinnae += `<path d="M${pt(p.x, p.y)} L${pt(p.x + dx * len * 0.9 + nx * curl * 0.7, p.y + dy * len * 0.9 + ny * curl * 0.7)}" stroke="#2a4a22" stroke-width="0.7" opacity="0.6"/>`;
    }
  }
  return svg(150, 260, [
    linear('fl', [[0, '#2d5629'], [0.5, '#4b853b'], [1, '#86b25c']], 0, 1, 1, 0),
    linear('fr', [[0, '#284c24'], [0.5, '#417634'], [1, '#74a150']], 0, 1, 1, 0),
    linear('fb', [[0, '#5a5a22'], [0.5, '#8a7a30'], [1, '#b39a4a']], 0, 1, 1, 0),
    linear('fs', [[0, '#5a4a26'], [1, '#6e8a3a']], 0, 1, 0, 0),
  ].join(''), [
    `<g stroke-linejoin="round">${pinnae}</g>`,
    `<path d="M30,250 Q40,150 112,14" fill="none" stroke="url(#fs)" stroke-width="3.2" stroke-linecap="round"/>`,
    `<path d="M112,14 C116,10 122,10 120,16" fill="none" stroke="#6e8a3a" stroke-width="2" stroke-linecap="round"/>`,
  ].join('\n'));
};

/* Forest: two acorns, one still in its cap and the other out of it, the empty cap lying on
   its back beside them. */
files['forest-acorns'] = () => {
  const rnd = noise(141);
  const nut = (x, y, deg, s) => [
    `<g transform="translate(${x} ${y}) rotate(${deg}) scale(${s})">`,
    `<path d="${blob([[-18, -6], [-17, 12], [-9, 28], [0, 31], [9, 28], [17, 12], [18, -6]], 1.2, rnd)}" fill="url(#an)"/>`,
    `<ellipse cy="30" rx="2.2" ry="1.6" fill="#3a2410"/>`,
    `<g clip-path="url(#anc)">${blotches(rnd, 0, 10, 10, 3, '#2a1606', 0.2)}${scuffs(rnd, 0, 8, 10, 3, '#f5dcb0', 0.4)}</g>`,
    `</g>`,
  ].join('');
  const capShape = () => blob([[-20, -4], [-18, -18], [-10, -27], [0, -28], [10, -27], [18, -18], [20, -4], [10, -1], [-10, -1]], 1, rnd);
  const cap = (x, y, deg, s, open) => [
    `<g transform="translate(${x} ${y}) rotate(${deg}) scale(${s})">`,
    `<path d="${capShape()}" fill="url(#ac)"/>`,
    `<path d="${capShape()}" fill="url(#as)"/>`,
    open ? `<path d="M-19,-4 C-12,2 12,2 19,-4 C12,-9 -12,-9 -19,-4 Z" fill="#3a2410"/><path d="M-14,-4 C-8,-1 8,-1 14,-4" fill="none" stroke="#6e5230" stroke-width="1"/>` : `<path d="M-20,-4 C-12,0 12,0 20,-4" fill="none" stroke="#3a2410" stroke-width="1.2"/>`,
    `<path d="M0,-28 C2,-32 7,-35 ${open ? 12 : 8},-${open ? 36 : 39}" fill="none" stroke="#4a3018" stroke-width="2.4" stroke-linecap="round"/>`,
    `</g>`,
  ].join('');
  return svg(160, 150, [
    radial('an', [[0, '#d4a060'], [0.45, '#a26a30'], [0.85, '#653c15'], [1, '#3b220b']], 0.5, 0.5, 0.6, 0.35, 0.25),
    radial('ac', [[0, '#a3855a'], [0.6, '#775c35'], [1, '#463218']], 0.5, 0.5, 0.65, 0.4, 0.2),
    `<clipPath id="anc"><path d="M-18,-6 C-18,16 -9,30 0,30 C9,30 18,16 18,-6 Z"/></clipPath>`,
    `<pattern id="as" width="7" height="5" patternUnits="userSpaceOnUse"><path d="M0,5 Q3.5,-1 7,5" fill="none" stroke="#3a2410" stroke-width="0.8" opacity="0.5"/><path d="M3.5,2.5 Q5.3,0 7,2.5 M0,2.5 Q1.7,0 3.5,2.5" fill="none" stroke="#fff3d8" stroke-width="0.5" opacity="0.25"/></pattern>`,
  ].join(''), [
    nut(52, 86, -24, 1),
    cap(52, 86, -24, 1, false),
    nut(104, 98, 32, 0.74),
    cap(136, 56, 150, 0.8, true),
  ].join('\n'));
};

/* Forest: a pine cone on its side, with scales missing where it was knocked about and the
   stalk broken short. */
files['forest-pinecone'] = () => {
  const rnd = noise(153);
  let scales = '';
  const cols = 9;
  for (let c = cols - 1; c >= 0; c -= 1) {
    const u = c / (cols - 1);
    const x = 30 + u * 112 + between(rnd, -2, 2);
    const h = 44 * Math.sin(Math.PI * (0.18 + 0.82 * u) ** 0.7) * (1 - 0.3 * u) + 6;
    const rows = Math.max(2, Math.round(h / 9));
    for (let k = 0; k <= rows; k += 1) {
      if (rnd() < 0.09) continue;
      const v = (k / rows) * 2 - 1;
      const y = 60 + v * h * 0.9 + (c % 2) * 4;
      const tilt = v * 26;
      const sh = 0.35 + 0.65 * (1 - Math.abs(v)) ** 0.5;
      const sc = between(rnd, 0.85, 1.12);
      scales += `<path d="M-10,0 C-9,-7 -2,-9 8,-6 C13,-4 16,-1 18,0 C16,1 13,4 8,6 C-2,9 -9,7 -10,0 Z" transform="translate(${r(x)} ${r(y)}) rotate(${r(tilt + between(rnd, -7, 7))}) scale(${r(sc)})" fill="url(#ps)" opacity="${r(sh * between(rnd, 0.85, 1))}" stroke="#2e1a08" stroke-width="0.6"/>`;
    }
  }
  const outline = blob([[18, 60], [30, 30], [60, 15], [90, 13], [126, 16], [150, 36], [156, 60], [150, 84], [126, 104], [88, 107], [52, 104], [26, 88]], 2, rnd);
  return svg(160, 120, [
    linear('ps', [[0, '#3b2410'], [0.5, '#84562e'], [0.85, '#c38d55'], [1, '#e2b784']], 0, 0, 1, 0),
    `<clipPath id="pc"><path d="${outline}"/></clipPath>`,
  ].join(''), [
    `<path d="${outline}" fill="#2a1806"/>`,
    `<g clip-path="url(#pc)">${scales}</g>`,
    `<path d="M20,60 C16,59 12,60 10,58" fill="none" stroke="#4a2e14" stroke-width="4" stroke-linecap="butt"/>`,
    `<path d="M9,56 L11,61 L8,60 Z" fill="#a98a66"/>`,
  ].join('\n'));
};

/* Forest: a dried beech leaf, curled at one edge, two holes where something ate it. */
files['forest-leaf'] = () => {
  const rnd = noise(165);
  const outline = blob([[14, 70], [30, 48], [52, 30], [80, 20], [108, 22], [132, 36], [142, 58], [134, 82], [112, 100], [84, 108], [56, 104], [32, 92]], 3, rnd);
  const veins = Array.from({ length: 7 }, (_, i) => {
    const t = 0.15 + i * 0.12;
    const x = 14 + 128 * t; const y = 70 - 2 * i;
    return `<path d="M${pt(x, y)} Q${pt(x + 10, y - 22)} ${pt(x + 18, y - 34)} M${pt(x, y)} Q${pt(x + 8, y + 20)} ${pt(x + 14, y + 30)}" />`;
  }).join('');
  return svg(150, 120, [
    linear('lf', [[0, '#8a5a2a'], [0.45, '#b8803c'], [1, '#d4a860']], 0, 1, 1, 0),
    linear('lu', [[0, '#e3c48c'], [1, '#caa368']], 0, 0, 0, 1),
    `<clipPath id="lc"><path d="${outline}"/></clipPath>`,
    `<mask id="lh"><rect width="150" height="120" fill="#fff"/><path d="${blob(ring(60, 58, 7, 5, 6), 1.5, rnd)}" fill="#000"/><path d="${blob(ring(104, 76, 4, 3.5, 6), 1, rnd)}" fill="#000"/></mask>`,
  ].join(''), [
    `<g mask="url(#lh)">`,
    `<path d="${outline}" fill="url(#lf)"/>`,
    `<path d="M112,100 C124,92 136,78 142,58 C140,74 130,90 118,98 Z" fill="url(#lu)"/>`,
    `<g fill="none" stroke="#6e4418" stroke-width="0.7" opacity="0.55">${veins}</g>`,
    `<path d="M14,70 Q80,66 140,58" fill="none" stroke="#5e3a14" stroke-width="1.3" opacity="0.7"/>`,
    `<g clip-path="url(#lc)">${blotches(rnd, 80, 64, 36, 7, '#5a3010', 0.16)}</g>`,
    `</g>`,
    `<path d="M14,70 C8,72 4,70 2,66" fill="none" stroke="#5e3a14" stroke-width="2" stroke-linecap="round"/>`,
  ].join('\n'));
};

for (const old of readdirSync(out)) if (!(old.replace(/\.svg$/, '') in files)) rmSync(join(out, old));
for (const [name, draw] of Object.entries(files)) {
  const text = draw();
  writeFileSync(join(out, `${name}.svg`), text);
  console.log(`${name}.svg ${text.length} bytes`);
}
