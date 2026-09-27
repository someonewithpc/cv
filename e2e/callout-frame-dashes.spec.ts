import { expect, test } from '@playwright/test';
import { PNG } from 'playwright-core/lib/utilsBundle';

/**
 * The chain-line boundary round each demo (Callout.astro `.callout-view`) is a repeating
 * gradient of hard stops: a 1rem dash, a 0.375rem gap, a 0.25rem dash, a 0.375rem gap. Its
 * stops are the theme's oklch() tokens, and Firefox 156 draws that gradient in its default
 * oklab as a dot every half rem, so the gradient names srgb. The stops are hard, so the
 * space changes no pixel here; this guards the pattern and the colour of the dash in every
 * theme, and that the space is still named.
 */

const THEMES = ['light', 'dark', 'arctic', 'dark-forest'];
// Past 105rem the title card stands beside the view (callout-inset.spec.ts), so the top edge
// starts clear of it.
const DESK_CARD = { width: 1728, height: 900 };
const REM = 16;
// Which pixels of the first 2rem of the line are ink: dash, gap, dash, gap.
const PATTERN = [...Array(2 * REM)].map((_, x) => (x < REM ? '#' : x < 1.375 * REM ? '.' : x < 1.625 * REM ? '#' : '.')).join('');

for (const theme of THEMES) {
  test(`the boundary draws both dashes in the ${theme} theme`, async ({ page }) => {
    await page.setViewportSize(DESK_CARD);
    await page.addInitScript((picked) => {
      localStorage.setItem('cv-theme', picked);
    }, theme);
    await page.goto('/');
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--theme-kind').trim()))
      .toBe(theme);

    const view = page.locator('.callout-view').first();
    await view.scrollIntoViewIfNeeded();
    await page.evaluate(() => document.fonts.ready);
    const dash = await view.evaluate((el) => getComputedStyle(el).getPropertyValue('--dash'));
    expect(dash, 'the gradient names the space Firefox draws right').toMatch(/^repeating-linear-gradient\(90deg in srgb,/);

    // The view may rest at a fractional offset, so the line can fall on any of three rows.
    const box = (await view.boundingBox())!;
    const shot = PNG.sync.read(
      await page.screenshot({ clip: { x: box.x, y: Math.floor(box.y) - 1, width: 2 * REM + 1, height: 3 }, animations: 'disabled' }),
    );
    const at = (x: number, y: number) => [...shot.data.subarray((y * shot.width + x) * 4, (y * shot.width + x) * 4 + 3)];
    const distance = (a: number[], b: number[]) => Math.max(...a.map((channel, i) => Math.abs(channel - b[i])));
    // The gaps are clear, so the cutting mat's ruling shows through them: a pixel is ink when it
    // is nearer the dash's colour than the gap's.
    const rows = [0, 1, 2].map((y) => {
      const ink = at(0, y);
      const gap = at(REM + 3, y);
      return { y, contrast: distance(ink, gap), inked: [...Array(2 * REM)].map((_, x) => (distance(at(x, y), ink) < distance(at(x, y), gap) ? '#' : '.')).join('') };
    });
    const line = rows.reduce((best, row) => (row.contrast > best.contrast ? row : best));
    expect(line.contrast, `no line at the top of the view in ${theme}`).toBeGreaterThan(24);
    expect(line.inked).toBe(PATTERN);
  });
}
