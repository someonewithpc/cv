import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

/** The build the preview serves; the web server builds it before any spec runs. */
const CLIENT = join(import.meta.dirname, '..', 'dist', 'client');

function builtFiles(dir: string, ext: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(ext))
    .map((entry) => join(entry.parentPath, entry.name));
}

/** Every `font-size` and `font` declaration whose size is written in px. A `font` shorthand's
 * line height, after the slash, may be anything. */
function pxFontSizes(css: string): string[] {
  const found: string[] = [];
  for (const [declaration] of css.matchAll(/(?<![\w-])font(?:-size)?\s*:[^;}"]*/g)) {
    const size = declaration.startsWith('font-size') ? declaration : declaration.split('/')[0];
    if (/\d(?:\.\d+)?px/.test(size)) found.push(declaration.trim());
  }
  return found;
}

test('no stylesheet or style attribute sets a font size in px', () => {
  const offenders: string[] = [];
  for (const file of builtFiles(CLIENT, '.css')) {
    for (const declaration of pxFontSizes(readFileSync(file, 'utf8'))) offenders.push(`${file}: ${declaration}`);
  }
  // Astro inlines small stylesheets, and components write style attributes into the page.
  for (const file of builtFiles(CLIENT, '.html')) {
    const html = readFileSync(file, 'utf8');
    const styles = [
      ...[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((match) => match[1]),
      ...[...html.matchAll(/\sstyle="([^"]*)"/g)].map((match) => match[1]),
    ];
    for (const css of styles) {
      for (const declaration of pxFontSizes(css)) offenders.push(`${file}: ${declaration}`);
    }
  }
  expect(offenders).toEqual([]);
});

/** Sets the browser's own default font size, the one a reader picks in its settings. */
async function setDefaultFontSize(page: Page, px: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Page.enable');
  await cdp.send('Page.setFontSizes', { fontSizes: { standard: px, fixed: px } });
}

const COPY = {
  'a highlight paragraph': '#open-source article > p',
  'a contribution title': '#open-source .title-text',
  'a skill in the bill of materials': '#bill-of-materials li',
};

for (const reader of [16, 20]) {
  test(`body copy reads at the root size with a ${reader}px browser default`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    if (reader !== 16) await setDefaultFontSize(page, reader);
    await page.goto('/');

    // Nothing declares a root size, so the root is the reader's own default.
    const root = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    expect(root).toBe(reader);

    for (const [what, selector] of Object.entries(COPY)) {
      const size = await page.locator(selector).first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(size, what).toBe(root);
    }
  });
}
