import { OS_THEMES, ROOT_FOLLOWING_OS, THEMES, rootShowing, type ThemeSettings } from '@/themes';

import { contrastRatio, liftedTo, mixWhite, oklchCss, parseOklch, toneAt } from './contrast';

/**
 * The tones the drawings on the blueprint sheets paint with, set per theme at build time.
 *
 * A sheet's ink is white mixed with the theme's blueprint, and its canvas is the blueprint
 * itself (see blueprint-sheet-boundary in scss/_colors.scss), so the room between them is
 * about 3:1 on the light themes and 8:1 on the dark ones. An alpha of the ink or the accent
 * lands somewhere different in each, and on the light sheets close to nothing. Each tone
 * here is the theme's own ink mixed into its own canvas until it lands on the ratio named
 * for it, so the drawings read the same on every sheet.
 */
export const TONE_RATIOS = {
  /** The end frame's fill: the icon covering the page, a tint behind everything else. */
  fill: 1.5,
  /** The wipe's middle frame, over the end frame. */
  mid: 1.9,
  /** The wipe's first frame, over both. */
  start: 2.4,
  /** Frame lines: the viewport, the dimension lines, the diagonal. */
  line: 3,
  /** Code keywords: the sheet's accent, lifted toward white where it reads fainter than this. */
  accent: 2.8,
} as const;

export type ToneName = keyof typeof TONE_RATIOS;

const sheet = (settings: ThemeSettings) => {
  const canvas = parseOklch(settings.blueprint);
  return {
    canvas,
    ink: mixWhite(canvas, 0.88),
    accent: mixWhite(parseOklch(settings.accent), 0.28),
  };
};

/** Each tone of a theme's sheet, as an oklch literal. */
export const sheetTones = (settings: ThemeSettings): Record<ToneName, string> => {
  const { canvas, ink, accent } = sheet(settings);
  const tone = (ratio: number) => oklchCss(toneAt(canvas, ink, ratio));
  return {
    fill: tone(TONE_RATIOS.fill),
    mid: tone(TONE_RATIOS.mid),
    start: tone(TONE_RATIOS.start),
    line: tone(TONE_RATIOS.line),
    accent: oklchCss(liftedTo(accent, [1, 0, accent[2]], canvas, TONE_RATIOS.accent)),
  };
};

/** The ratio each tone lands on against the sheet's canvas, for the record. */
export const sheetRatios = (settings: ThemeSettings): Record<ToneName, number> => {
  const { canvas } = sheet(settings);
  const tones = sheetTones(settings);
  return Object.fromEntries(
    Object.entries(tones).map(([name, css]) => [name, Math.round(contrastRatio(canvas, parseOklch(css)) * 100) / 100]),
  ) as Record<ToneName, number>;
};

/**
 * CSS setting `--tone-<name>` inside `scope` for the theme on screen, keyed on the picker's
 * own selectors (src/themes.ts) with the OS scheme as the fallback, like shownCss.
 */
export function tonesCss(scope: string): string {
  const declare = (settings: ThemeSettings) => (
    `{ ${Object.entries(sheetTones(settings)).map(([name, css]) => `--tone-${name}: ${css};`).join(' ')} }`
  );
  const os = Object.entries(OS_THEMES).map(([id, settings]) => (
    `@media (prefers-color-scheme: ${id}) { ${ROOT_FOLLOWING_OS} ${scope} ${declare(settings)} }`
  ));
  const picks = Object.entries(THEMES).map(([id, settings]) => `:is(${rootShowing(id)}) ${scope} ${declare(settings)}`);
  return [...os, ...picks].join('\n');
}
