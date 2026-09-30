/**
 * The page's themes, and the selectors that say which one is on screen. ThemePicker.astro
 * writes the variables and the radios from this table; the theme picker demo draws it.
 */

export type ThemeFollows = 'light' | 'dark';

export type ThemeSettings = {
  canvas: string;
  ink: string;
  accent: string;
  blueprint: string;
  /**
   * The desk the page lies on: public/desk/<deskTile>.webp, which scripts/bake-desk-tiles.mjs
   * bakes from a veneer scan with this theme's colour and blend already in it, and `desk`,
   * that tile's average, which shows until the tile loads.
   */
  desk: string;
  deskTile: string;
  /**
   * The plain paper, which the drawing sheets and the contributions page both take. Hugo
   * picked one per theme on the tuner. A theme without one sets it to initial, so the
   * var() fallbacks take the ramp step; left unset, it would inherit light's white from :root.
   */
  paper?: string;
  /**
   * How strongly the paper's fibre tile shows on a drawing page, tuned so the painted sheet
   * has a spread of about two levels. A paler sheet takes a fraction of this; see paper-grain
   * in _colors.scss.
   */
  paperGrain: string;
  /** The same on the contributions paper, which reads as the rougher sheet. Spread 2.6, and
   * L* 91.7 against the 96.5 the sheet has bare: multiply pays for roughness in darkening.
   * Round 4 ran this at 0.44, which is spread 3.2 at L* 90.6, and that read as too strong. */
  paperSheetGrain: string;
  /** multiply for a light sheet, screen for a dark one -- see paper-grain in _colors.scss. */
  paperBlend: 'multiply' | 'screen';
  /** '1' flips the tile dark-side-up for screen on a dark sheet, '0' leaves it as scanned. */
  paperInvert: '0' | '1';
  follows: ThemeFollows;
  /**
   * Code colours, one per group of token kinds, for a theme whose accent, blueprint and ink
   * sit too close in hue for the roles scss/_code.scss draws from them. Left out, those roles
   * stand.
   */
  code?: { keyword: string; attribute: string; string: string; comment: string };
  name: string;
  transitionScaleFactor: number;
  icons: {
    checked: string;
    unchecked: string;
  };
};

export const THEMES = {
  light: {
    // Round 1 lifted the light paper off grey, oklch(0.94 0.014 85) to here, at Hugo's ask.
    canvas: 'oklch(0.97 0.011 85)',
    ink: 'oklch(0.24 0.025 260)',
    accent: 'oklch(0.7 0.13 65)',
    blueprint: 'oklch(0.622 0.121 254)',
    desk: 'rgb(229 200 160)',
    deskTile: 'light',
    paper: 'oklch(1 0 90)',
    paperGrain: '0.45',
    paperSheetGrain: '0.48',
    paperBlend: 'multiply',
    paperInvert: '0',
    follows: 'light',
    name: 'Light',
    transitionScaleFactor: 2.4,
    icons: {
      checked: 'sun-filled',
      unchecked: 'sun',
    },
  },
  dark: {
    canvas: 'oklch(0.2 0.035 265)',
    ink: 'oklch(0.92 0.02 250)',
    accent: 'oklch(0.78 0.1 75)',
    blueprint: 'oklch(0.4 0.12 265)',
    desk: 'rgb(31 28 24)',
    deskTile: 'dark',
    paperGrain: '0.33',
    paperSheetGrain: '0.35',
    paperBlend: 'screen',
    paperInvert: '1',
    follows: 'dark',
    name: 'Dark',
    transitionScaleFactor: 1.2,
    icons: {
      checked: 'moon-filled',
      unchecked: 'moon',
    },
  },
  arctic: {
    canvas: 'oklch(0.96 0.016 230)',
    ink: 'oklch(0.3 0.04 250)',
    accent: 'oklch(0.52 0.1 210)',
    blueprint: 'oklch(0.606 0.110 222)',
    desk: 'rgb(212 203 197)',
    deskTile: 'arctic',
    paper: 'oklch(0.955 0.015 235)',
    // Accent, blueprint and ink are all blues here, so code spreads its kinds over hue: a deep
    // blue for keywords and tags, teal for attributes, the desk's warm brown for strings and
    // numbers, a grey of the ink for comments. Each clears 5.8:1 on the code ground.
    code: {
      keyword: 'oklch(0.41 0.16 262)',
      attribute: 'oklch(0.44 0.085 185)',
      string: 'oklch(0.45 0.085 50)',
      comment: 'oklch(0.45 0.03 245)',
    },
    paperGrain: '0.40',
    paperSheetGrain: '0.52',
    paperBlend: 'multiply',
    paperInvert: '0',
    follows: 'light',
    name: 'Arctic',
    transitionScaleFactor: 2,
    icons: {
      checked: 'snowflake-filled',
      unchecked: 'snowflake',
    },
  },
  'dark-forest': {
    canvas: 'oklch(0.17 0.035 145)',
    ink: 'oklch(0.9 0.035 110)',
    accent: 'oklch(0.72 0.1 95)',
    blueprint: 'oklch(0.370 0.089 156)',
    desk: 'rgb(37 27 12)',
    deskTile: 'dark-forest',
    paper: 'oklch(0.323 0.044 139)',
    paperGrain: '0.27',
    paperSheetGrain: '0.40',
    paperBlend: 'screen',
    paperInvert: '1',
    follows: 'dark',
    name: 'Forest',
    transitionScaleFactor: 1.4,
    icons: {
      checked: 'leaf-filled',
      unchecked: 'leaf',
    },
  },
} as const satisfies Record<string, ThemeSettings>;

export type ThemeId = keyof typeof THEMES;

export const THEME_IDS = Object.keys(THEMES) as ThemeId[];

/** The two the OS can ask for by prefers-color-scheme. */
export const OS_THEMES = {
  light: THEMES.light,
  dark: THEMES.dark,
} as const;

/** Where the pick is kept between visits; Layout.astro's head script reads the same key. */
export const THEME_STORAGE_KEY = 'cv-theme';

/* Match the radios by id. Naming an attribute inside :has() puts every input in the
   document into the invalidation set for :root, so any `value` or `name` write
   anywhere restyled the whole page. */
export const themeInputId = (id: string) => `theme-${id}`;

/** The picker's radio for `id`, picked: checked, or marked checked while a wipe runs. */
export const themePicked = (id: string) => `#${themeInputId(id)}:is(:not(.with-transition):checked, .with-transition.checked)`;

export const ANY_THEME_PICKED = THEME_IDS.map(themePicked).join(', ');

/** `:root` while `id` is on screen by a pick. The pick stamps data-theme and checks the radio in
   the same commit, so with script the attribute alone decides. */
export const rootShowing = (id: string) => `:root[data-theme="${id}"]`;

/** `:root` with `id`'s radio picked, for @media (scripting: none) only. Any :root:has() in the
   cascade makes the root an anchor, and every node inserted on the page then walks the
   document's :has() invalidation set. */
export const rootRadioPicked = (id: string) => `:root:has(${themePicked(id)})`;

/** `:root` while nothing is picked, so the OS colour scheme decides. Without script, a picked
   radio's rule outranks it: the id inside :has() is the heavier selector. */
export const ROOT_FOLLOWING_OS = ':root:not([data-theme])';
