import { expect, test } from '@playwright/test';

/**
 * Below 1680px there is no lane beside the drawing for a detail's title card, so the card is
 * a slip tucked under the stack (Callout.astro), square to it: its top under the sheets, only
 * its text below them, inside the detail's boundary. The text has to be on the page, readable
 * and not covered by the sheets at every width.
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
        const covered = [...card.querySelectorAll('dt, dd')].filter((cell) => cell.getClientRects().length > 0).filter((cell) => {
          const r = cell.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + 4, r.top + r.height / 2);
          return !hit || !card.contains(hit);
        }).length;
        const sizes = [...card.querySelectorAll('.title-card *')]
          .filter((node) => node.childNodes.length > 0)
          .map((node) => parseFloat(getComputedStyle(node).fontSize));
        // How far the entries start below what is over the slip: the lowest sheet of the fan
        // along the slip, or on a phone the peel hint the top stack writes on it.
        const first = card.querySelector('dt')!.getBoundingClientRect();
        let over = -Infinity;
        for (let x = Math.ceil(box.left + 2); x < box.right - 2; x += 4) {
          for (let y = Math.floor(first.top); y > box.top; y--) {
            const hit = document.elementFromPoint(x, y);
            if (hit && !card.contains(hit) && !hit.matches('.callout-view, .callout, .technical-drawing-frame, .technical-drawing-stack')) {
              over = Math.max(over, y);
              break;
            }
          }
        }
        const hint = el.querySelector('.technical-drawing-frame[data-hint-show] .flip-hint--fwd.hint-words')?.getBoundingClientRect();
        if (hint && hint.bottom > box.top && hint.left < box.right) over = Math.max(over, hint.bottom);
        const entries = [...card.querySelectorAll('dt')]
          .filter((dt) => dt.getClientRects().length > 0)
          .map((dt) => dt.textContent!.trim());
        const { rotate, transform } = getComputedStyle(card);
        return { box, stack, view, covered, smallest: Math.min(...sizes), entries, rotate, transform, lead: first.top - over };
      });
      expect(geometry.box.top, 'tucked under the stack').toBeLessThan(geometry.stack.bottom);
      expect(geometry.box.bottom, 'sticks out below it').toBeGreaterThan(geometry.stack.bottom);
      expect(geometry.box.bottom, 'inside the boundary').toBeLessThanOrEqual(geometry.view.bottom);
      expect(geometry.covered, 'lines covered by the sheets').toBe(0);
      expect(geometry.smallest).toBeGreaterThanOrEqual(8);
      // Stacked, the slip keeps to the title and the notes.
      expect(geometry.entries).toEqual(['Title', 'Notes']);
      expect(geometry.rotate, 'square to the stack').toBe('none');
      expect(geometry.transform, 'square to the stack').toBe('none');
      // Only the entries show below the stack: they start just under the fan, or the hint.
      expect(geometry.lead, 'gap over the first entry').toBeGreaterThanOrEqual(2);
      expect(geometry.lead, 'gap over the first entry').toBeLessThanOrEqual(16);
    }

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
