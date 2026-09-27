import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

/**
 * Firefox drops a whole rule when its selector list holds a selector it does not parse, and it
 * does not parse `::picker(select)`. The build merges neighbouring rules with the same
 * declarations into one selector list, so a select's rule can be lost with its picker's
 * (MarkerEditor.scss, EditStyle.scss). Every built rule that names a picker must name nothing
 * else.
 */

const css = fileURLToPath(new URL('../dist/client/_astro', import.meta.url));

/** The selector lists of every rule in a stylesheet, split at top-level commas. */
function selectorLists(sheet: string): string[][] {
  const lists: string[][] = [];
  let depth = 0;
  let prelude = '';
  for (const char of sheet) {
    if (char === '{') {
      if (!prelude.trim().startsWith('@')) lists.push(splitTopLevel(prelude));
      prelude = '';
      depth++;
    } else if (char === '}') {
      depth--;
      prelude = '';
    } else if (depth >= 0) {
      prelude += char;
    }
  }
  return lists;
}

function splitTopLevel(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let part = '';
  for (const char of list) {
    if (char === '(') depth++;
    if (char === ')') depth--;
    if (char === ',' && depth === 0) {
      parts.push(part.trim());
      part = '';
    } else {
      part += char;
    }
  }
  parts.push(part.trim());
  return parts;
}

test('a built rule that styles ::picker names nothing Firefox would keep', () => {
  const offenders: string[] = [];
  let pickers = 0;
  for (const file of readdirSync(css).filter((name) => name.endsWith('.css'))) {
    for (const list of selectorLists(readFileSync(`${css}/${file}`, 'utf8'))) {
      if (!list.some((selector) => selector.includes('::picker'))) continue;
      pickers++;
      if (list.some((selector) => !selector.includes('::picker'))) offenders.push(`${file}: ${list.join(', ')}`);
    }
  }
  expect(pickers, 'the build has picker rules to check').toBeGreaterThan(0);
  expect(offenders).toEqual([]);
});
