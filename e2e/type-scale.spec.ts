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

/** Each selector with its size as a share of the root. */
const COPY: Record<string, [string, number]> = {
  'a highlight paragraph': ['#open-source article > p', 1],
  'a contribution title': ['#open-source .title-text', 1],
  'a skill in the bill of materials': ['#bill-of-materials li', 0.875],
};

for (const reader of [16, 20]) {
  test(`body copy reads at the root size with a ${reader}px browser default`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    if (reader !== 16) await setDefaultFontSize(page, reader);
    await page.goto('/');

    // Nothing declares a root size, so the root is the reader's own default.
    const root = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    expect(root).toBe(reader);

    for (const [what, [selector, share]] of Object.entries(COPY)) {
      const size = await page.locator(selector).first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(size, what).toBe(root * share);
    }
  });
}

const CAREER_COPY = {
  'a Career summary': '#career .description > p:not(.see)',
  'a Career note': '#career .description li',
};

test('the Career sheet sets its copy at the root size', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setDefaultFontSize(page, 20);
  await page.goto('/');
  for (const [what, selector] of Object.entries(CAREER_COPY)) {
    const size = await page.locator(selector).first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size, what).toBe(20);
  }
});

for (const theme of ['light', 'dark', 'arctic', 'dark-forest']) {
  for (const width of [390, 768, 1440]) {
    test(`with a 20px default the Career sheet fits ${width}px in the ${theme} theme`, async ({ page }) => {
      await page.addInitScript((id) => localStorage.setItem('cv-theme', id), theme);
      await page.setViewportSize({ width, height: 900 });
      await setDefaultFontSize(page, 20);
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

      const sheet = page.locator('#career');
      await sheet.scrollIntoViewIfNeeded();
      const measured = await sheet.evaluate((el) => {
        const box = el.getBoundingClientRect();
        let widest = 0;
        for (const node of el.querySelectorAll('*')) widest = Math.max(widest, node.getBoundingClientRect().right);
        const titleBlock = document.querySelector('.title-block')!.getBoundingClientRect();
        const shown = [...el.querySelectorAll('svg.drawing')].find((svg) => svg.getBoundingClientRect().width > 0)!;
        const scale = shown.getBoundingClientRect().width / Number(shown.getAttribute('viewBox')!.split(' ')[2]);
        return {
          right: box.right,
          top: box.top,
          titleBlockBottom: titleBlock.bottom,
          widest,
          lettering: 12 * scale,
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        };
      });

      expect(measured.scrollWidth, 'the page scrolls sideways').toBeLessThanOrEqual(measured.clientWidth);
      expect(measured.widest, 'something reaches past the sheet').toBeLessThanOrEqual(measured.right + 1);
      expect(measured.top, 'the sheet starts under the title block').toBeGreaterThanOrEqual(measured.titleBlockBottom);
      expect(measured.lettering, 'the drawing lettering is under 8px').toBeGreaterThanOrEqual(8);
    });
  }
}
