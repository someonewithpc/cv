import fs from 'node:fs';
import path from 'node:path';

import * as sass from 'sass';

import { OS_THEMES, THEMES, type ThemeSettings } from '@/themes';

import { oklchCss, parseOklch, toneAt } from './contrast';

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

/** The ink share, on a paper of this theme, that lands the mix on WIRE_CONTRAST against it. */
const wireColor = (settings: ThemeSettings): string => (
  oklchCss(toneAt(parseOklch(settings.paper ?? settings.canvas), parseOklch(settings.ink), WIRE_CONTRAST))
);

const seeds = (settings: ThemeSettings) => `
  --theme-canvas: ${settings.canvas};
  --theme-ink: ${settings.ink};
  --theme-accent: ${settings.accent};
  --theme-blueprint: ${settings.blueprint};
  --theme-paper: ${settings.paper ?? 'initial'};
  --theme-mode: ${settings.follows};
  --accent-text: ${settings.follows === 'dark' ? 'var(--accent-800)' : 'oklch(from var(--theme-accent) 0.42 c h)'};
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
