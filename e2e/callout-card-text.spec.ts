import { expect, test } from '@playwright/test';

/**
 * Below 1680px there is no lane beside the drawing for a detail's title card, so the card is
 * a slip tucked under the stack (Callout.astro): its top under the sheets, its text below
 * them, inside the detail's boundary. The text has to be on the page, readable and not
 * covered by the sheets at every width.
 */

for (const width of [390, 1024, 1440]) {
  test(`every title card sticks out from under its stack at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 800 ? 844 : 900 });
    await page.goto('/');

    const callouts = page.locator('#demos .callout[data-card]');
    const count = await callouts.count();
    expect(count).toBeGreaterThan(0);

    for (let index = 0; index < count; index++) {
      const callout = callouts.nth(index);
      const notes = callout.locator('.title-cell-notes dd');
      await callout.locator('.callout-card').evaluate((el) => el.scrollIntoView({ block: 'center' }));
      await expect(notes).toBeVisible();
      await expect(notes).toBeInViewport();

      const geometry = await callout.evaluate((el) => {
        const card = el.querySelector<HTMLElement>('.callout-card')!;
        const box = card.getBoundingClientRect();
        const stack = el.querySelector('article.technical-drawing-stack')!.getBoundingClientRect();
        const view = el.querySelector('.callout-view')!.getBoundingClientRect();
        // Every line of the card's text is the card's to paint, not a sheet's over it.
        const covered = [...card.querySelectorAll('dt, dd')].filter((cell) => {
          const r = cell.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + 4, r.top + r.height / 2);
          return !hit || !card.contains(hit);
        }).length;
        const sizes = [...card.querySelectorAll('.title-card *')]
          .filter((node) => node.childNodes.length > 0)
          .map((node) => parseFloat(getComputedStyle(node).fontSize));
        return { box, stack, view, covered, smallest: Math.min(...sizes) };
      });
      expect(geometry.box.top, 'tucked under the stack').toBeLessThan(geometry.stack.bottom);
      expect(geometry.box.bottom, 'sticks out below it').toBeGreaterThan(geometry.stack.bottom);
      expect(geometry.box.bottom, 'inside the boundary').toBeLessThanOrEqual(geometry.view.bottom);
      expect(geometry.covered, 'lines covered by the sheets').toBe(0);
      expect(geometry.smallest).toBeGreaterThanOrEqual(8);
    }

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
