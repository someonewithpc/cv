import { expect, type Page, test } from '@playwright/test';

// Runs in the firefox-noscript project only (playwright.config.ts): system Firefox with its
// javascript.enabled pref off. Firefox has no ::scroll-button() or ::scroll-marker, so the
// no-script stack is a bare scroll-snap row there, and PaperStack shows the next sheet's edge
// to say so. Locator actions and screenshots hang with the pref off, so everything below reads
// the page through evaluate and drives it with the mouse.

type Row = { rowLeft: number; rowRight: number; rowMiddle: number; sheetLefts: number[]; sheetRights: number[]; scrollLeft: number; maxScroll: number };

const readRow = (page: Page, index = 0) =>
  page.evaluate((i) => {
    const row = document.querySelectorAll<HTMLElement>('[data-paper-stack-root]')[i];
    const box = row.getBoundingClientRect();
    const sheets = [...row.children].map((sheet) => sheet.getBoundingClientRect());
    return {
      rowLeft: box.left,
      rowRight: box.right,
      rowMiddle: (box.top + box.bottom) / 2,
      sheetLefts: sheets.map((sheet) => sheet.left),
      sheetRights: sheets.map((sheet) => sheet.right),
      scrollLeft: row.scrollLeft,
      maxScroll: row.scrollWidth - row.clientWidth,
    } satisfies Row;
  }, index);

for (const width of [1440, 390]) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('every stack is a scroll-snap row with the next sheet showing at its edge', async ({ page }) => {
      await page.goto('/');
      const found = await page.evaluate(() => ({
        noScript: matchMedia('(scripting: none)').matches,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        stacks: [...document.querySelectorAll<HTMLElement>('[data-paper-stack-root]')].map((row) => {
          const style = getComputedStyle(row);
          const box = row.getBoundingClientRect();
          const next = row.children[1]?.getBoundingClientRect();
          return {
            label: row.getAttribute('aria-label'),
            display: style.display,
            snap: style.scrollSnapType,
            nextShows: next ? box.right - next.left : null,
          };
        }),
      }));

      expect(found.noScript, 'the pref gives a page without script').toBe(true);
      expect(found.overflow, 'the document scrolls sideways').toBe(0);
      expect(found.stacks.length).toBeGreaterThanOrEqual(3);
      for (const stack of found.stacks) {
        expect(stack.display, stack.label ?? '').toBe('flex');
        expect(stack.snap, stack.label ?? '').toBe('x mandatory');
        // More than a hairline of the second sheet inside the row: its edge is on show.
        expect(stack.nextShows, stack.label ?? '').toBeGreaterThan(8);
      }
    });

    test('a sideways scroll moves one sheet, and the last sheet is reachable', async ({ page }) => {
      await page.goto('/');
      await page.evaluate(() => document.querySelector('[data-paper-stack-root]')!.scrollIntoView({ block: 'center' }));
      const start = await readRow(page);
      expect(start.scrollLeft).toBe(0);
      expect(Math.abs(start.sheetLefts[0] - start.rowLeft)).toBeLessThan(1);

      await page.mouse.move(Math.round((start.rowLeft + start.rowRight) / 2), Math.round(start.rowMiddle));
      // Sheets are fractional pixels wide, so an edge lands within a pixel and a half of the row's.
      // A third of a sheet: short of the next one, so only the snap can carry the row there.
      await page.mouse.wheel(Math.round((start.rowRight - start.rowLeft) / 3), 0);
      await expect
        .poll(async () => {
          const row = await readRow(page);
          return Math.abs(row.sheetLefts[1] - row.rowLeft);
        })
        .toBeLessThan(1.5);

      await page.evaluate(() => {
        const row = document.querySelector<HTMLElement>('[data-paper-stack-root]')!;
        row.scrollTo({ left: row.scrollWidth, behavior: 'instant' });
      });
      await expect
        .poll(async () => {
          const row = await readRow(page);
          return Math.abs(row.rowRight - row.sheetRights[row.sheetRights.length - 1]);
        })
        .toBeLessThan(1.5);
    });
  });
}
