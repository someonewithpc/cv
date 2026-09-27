import fs from 'node:fs';
import path from 'node:path';

import * as sass from 'sass';

import { OS_THEMES, THEMES, type ThemeSettings } from '@/themes';

/**
 * What the stage's shadow root ships at build time: its stylesheet and its icons.
 *
 * The stage is a page of its own inside a shadow root, so the document's rules never reach
 * it and its own never leave. Custom properties do cross the boundary, inward, so every
 * token the stage reads is set again here, keyed on the stage's own stamp, from the same
 * mixins the page mixes its ramps with. `@property` rules stay out: inside a shadow root
 * they register nothing.
 */

const srcRoot = path.join(process.cwd(), 'src');

/**
 * The wireframe's blocks stand for text, at a gentle, even weight -- never as dark or as light
 * as the page's own ink. The primitive ramp mixes toward --theme-canvas, but the wireframe
 * paints on --theme-paper, and the two part ways in some themes (Forest's paper sits well off
 * its canvas), so a ramp step reads right in one theme and wrong in the rest. --wire mixes
 * straight into the paper instead, at whatever share of the ink each theme needs to land on
 * the same WCAG ratio, so every theme's blocks sit at the same gentle contrast against the
 * ground they actually paint on.
 */
const WIRE_CONTRAST = 3.5;

type Oklch = [number, number, number];

const parseOklch = (css: string): Oklch => {
  const m = css.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/);
  if (!m) throw new Error(`wireColor: not a plain oklch() literal: ${css}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
};

const oklchToLinearSrgb = (l: number, c: number, hDeg: number): [number, number, number] => {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.2914855480 * b;
  const [ll, mm, ss] = [l_ ** 3, m_ ** 3, s_ ** 3];
  return [
    +4.0767416621 * ll - 3.3077115913 * mm + 0.2309699292 * ss,
    -1.2684380046 * ll + 2.6097574011 * mm - 0.3413193965 * ss,
    -0.0041960863 * ll - 0.7034186147 * mm + 1.7076147010 * ss,
  ];
};

const relativeLuminance = ([l, c, h]: Oklch) => {
  const clamp = (x: number) => Math.min(Math.max(x, 0), 1);
  const [r, g, b] = oklchToLinearSrgb(l, c, h).map(clamp);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrastRatio = (a: Oklch, b: Oklch) => {
  const [lum1, lum2] = [relativeLuminance(a), relativeLuminance(b)];
  const [lighter, darker] = lum1 > lum2 ? [lum1, lum2] : [lum2, lum1];
  return (lighter + 0.05) / (darker + 0.05);
};

const hueLerp = (h1: number, h2: number, t: number) => {
  const d = (((h2 - h1 + 540) % 360) - 180 + 360) % 360 - 180;
  return (h1 + d * t + 360) % 360;
};

const mixOklch = (from: Oklch, to: Oklch, t: number): Oklch => [
  from[0] + (to[0] - from[0]) * t,
  from[1] + (to[1] - from[1]) * t,
  hueLerp(from[2], to[2], t),
];

/** The ink share, on a paper of this theme, that lands the mix on WIRE_CONTRAST against it. */
const wireColor = (settings: ThemeSettings): string => {
  const paper = parseOklch(settings.paper ?? settings.canvas);
  const ink = parseOklch(settings.ink);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (contrastRatio(paper, mixOklch(paper, ink, mid)) < WIRE_CONTRAST) lo = mid; else hi = mid;
  }
  const [l, c, h] = mixOklch(paper, ink, hi);
  return `oklch(${l.toFixed(4)} ${c.toFixed(4)} ${h.toFixed(2)})`;
};

const seeds = (settings: ThemeSettings) => `
  --theme-canvas: ${settings.canvas};
  --theme-ink: ${settings.ink};
  --theme-accent: ${settings.accent};
  --theme-blueprint: ${settings.blueprint};
  --theme-paper: ${settings.paper ?? 'initial'};
  --theme-mode: ${settings.follows};
  --accent-text: ${settings.follows === 'dark' ? 'var(--accent-9)' : 'oklch(from var(--theme-accent) 0.42 c h)'};
  --wire: ${wireColor(settings)};
`;

/* The screen follows the OS while nothing is stamped on it, the way the page does. */
const seedRules = [
  ...Object.entries(OS_THEMES).map(([id, settings]) => (
    `@media (prefers-color-scheme: ${id}) { [data-screen]:not([data-demo-theme]) { ${seeds(settings)} } }`
  )),
  ...Object.entries(THEMES).map(([id, settings]) => (
    `[data-demo-theme="${id}"] { ${seeds(settings)} }`
  )),
  /* The stage's readout: the stamp on it, or none. */
  ...Object.keys(THEMES).map((id) => `[data-screen][data-demo-theme="${id}"] ~ .stamp [data-stage-shown="${id}"] { display: inline; }`),
  '[data-screen]:not([data-demo-theme]) ~ .stamp [data-stage-shown="none"] { display: inline; }',
].join('\n');

export function stageCss(): string {
  const scss = fs.readFileSync(path.join(srcRoot, 'components/ThemePickerDemo/layers/stage.scss'), 'utf8');
  return sass.compileString(`${scss}\n${seedRules}`, {
    loadPaths: [path.join(srcRoot, 'scss')],
    style: 'compressed',
  }).css;
}

/** An icon as inline markup: a `<use>` cannot reach the document's sprite from a shadow root. */
export function iconSvg(name: string, attrs = ''): string {
  const file = fs.readFileSync(path.join(srcRoot, `icons/${name}.svg`), 'utf8');
  const viewBox = file.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 24 24';
  const paths = [...file.matchAll(/<path[^>]*d="([^"]+)"/g)].map((m) => `<path fill="currentColor" d="${m[1]}"/>`).join('');
  return `<svg viewBox="${viewBox}" aria-hidden="true" ${attrs}>${paths}</svg>`;
}
