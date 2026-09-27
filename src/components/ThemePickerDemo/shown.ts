import { ANY_THEME_PICKED, OS_THEMES, ROOT_FOLLOWING_OS, THEME_IDS, rootShowing } from '@/themes';

/**
 * CSS that marks, inside `scope`, the elements that belong to the theme on screen and to
 * whoever chose it. An element carries `data-shown="<theme id>"`, or `data-chosen="os"`
 * while nothing is picked, `data-chosen="pick"` once something is, and `data-chosen="stamp"` or
 * `data-chosen="radio"` for the two halves of a pick. A marked element gets
 * `--shown: 1`, `--shown-display: inline` and `--hidden-display: none`, which the sheets
 * read; the properties inherit, so an element can mark its children too. The selectors are
 * the picker's own (src/themes.ts), so the sheet and the page can never disagree.
 */
export function shownCss(scope: string): string {
  const mark = '{ --shown: 1; --shown-display: inline; --hidden-display: none; }';
  const os = Object.keys(OS_THEMES).map((id) => (
    `@media (prefers-color-scheme: ${id}) { ${ROOT_FOLLOWING_OS} ${scope} [data-shown="${id}"] ${mark} }`
  ));
  const picks = THEME_IDS.map((id) => `:is(${rootShowing(id)}) ${scope} [data-shown="${id}"] ${mark}`);
  const chosen = [
    `${ROOT_FOLLOWING_OS} ${scope} [data-chosen="os"] ${mark}`,
    `:is(:root[data-theme], :root:has(${ANY_THEME_PICKED})) ${scope} [data-chosen="pick"] ${mark}`,
    `:root[data-theme] ${scope} [data-chosen="stamp"] ${mark}`,
    `:root:has(${ANY_THEME_PICKED}) ${scope} [data-chosen="radio"] ${mark}`,
  ];
  return [...os, ...picks, ...chosen].join('\n');
}
