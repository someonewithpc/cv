import { ANY_THEME_PICKED, OS_THEMES, ROOT_FOLLOWING_OS, THEME_IDS, rootShowing } from '@/themes';

/**
 * What layers/_shown.scss builds its rules from, through `@use "ts:…"` (plugins/sassFromTs.mjs).
 * The selectors are the picker's own (src/themes.ts), so the sheet and the page can never
 * disagree.
 */
export const sass = {
  osThemes: Object.keys(OS_THEMES),
  /** Each theme id, and the `:root` that is on screen while it is picked. */
  rootsShowing: Object.fromEntries(THEME_IDS.map((id) => [id, rootShowing(id)])),
  rootFollowingOs: ROOT_FOLLOWING_OS,
  anyThemePicked: ANY_THEME_PICKED,
};
