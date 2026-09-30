import { expect, type Page, test } from '@playwright/test';

// Runs in the firefox-noscript project only (playwright.config.ts): system Firefox with its
// javascript.enabled pref off. Firefox has no ::scroll-button() or ::scroll-marker, so the
// no-script stack is a bare scroll-snap row there, and PaperStack shows the next sheet's edge
// to say so. Locator actions and screenshots hang with the pref off, so everything below reads
// the page through evaluate and drives it with the mouse.

type Row = { slack: number; rowLeft: number; rowRight: number; rowMiddle: number; sheetLefts: number[]; sheetRights: number[]; scrollLeft: number; maxScroll: number };

const readRow = (page: Page, index = 0) =>
  page.evaluate((i) => {
    const row = document.querySelectorAll<HTMLElement>('[data-paper-stack-root]')[i];
    const box = row.getBoundingClientRect();
    const sheets = [...row.children].map((sheet) => sheet.getBoundingClientRect());
    return {
      // The row reaches this far past a resting sheet on each side (--row-slack), so no snap
      // lands on a pixel that cuts the sheet's border.
      slack: parseFloat(getComputedStyle(row).paddingLeft),
      rowLeft: box.left,
      rowRight: box.right,
      rowMiddle: (box.top + box.bottom) / 2,
      sheetLefts: sheets.map((sheet) => sheet.left),
      sheetRights: sheets.map((sheet) => sheet.right),
      scrollLeft: row.scrollLeft,
      maxScroll: row.scrollWidth - row.clientWidth,
    } satisfies Row;
  }, index);

// The row once its snap has finished. A snap scrolls smoothly, and a sheet on its way can pass
// through the slack before it comes to rest somewhere else.
const settled = async (page: Page) => {
  let last = Number.NaN;
  await expect
    .poll(async () => {
      const now = (await readRow(page)).scrollLeft;
      const still = now === last;
      last = now;
      return still;
    }, { intervals: [250] })
    .toBe(true);
  return readRow(page);
};

// Whether the sheet at index i (-1 for the last) rests with its leading edge (the right edge for
// the last) inside the row's slack: never past the row's edge, where the border would be cut, and
// never more than the slack plus a pixel and a half in, as sheets are fractional pixels wide.
const inSlack = (row: Row, i: number) => {
  const gap = i < 0 ? row.rowRight - row.sheetRights.at(i)! : row.sheetLefts[i] - row.rowLeft;
  return gap > -0.5 && gap < row.slack + 1.5;
};

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
          const sheet = row.children[0].getBoundingClientRect();
          return {
            label: row.getAttribute('aria-label'),
            display: style.display,
            snap: style.scrollSnapType,
            nextShows: next ? box.right - next.left : null,
            // How far the first sheet reaches below the row's scrollport, which ends where the
            // scrollbar starts.
            underScrollbar: sheet.bottom - (box.top + row.clientTop + row.clientHeight),
            scrollbar: row.offsetHeight - row.clientHeight,
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
        // Headless Firefox draws a classic scrollbar, which takes space; the row makes room for
        // it below the sheet instead of over the sheet's bottom edge.
        expect(stack.scrollbar, `${stack.label ?? ''} scrollbar takes space`).toBeGreaterThan(0);
        expect(stack.underScrollbar, stack.label ?? '').toBeLessThanOrEqual(0);
      }
    });

    test('a sideways scroll moves one sheet, and the last sheet is reachable', async ({ page }) => {
      await page.goto('/');
      await page.evaluate(() => document.querySelector('[data-paper-stack-root]')!.scrollIntoView({ block: 'center' }));
      const start = await readRow(page);
      expect(start.scrollLeft).toBe(0);
      expect(start.sheetLefts[0] - start.rowLeft).toBeCloseTo(start.slack, 0);

      await page.mouse.move(Math.round((start.rowLeft + start.rowRight) / 2), Math.round(start.rowMiddle));
      // A third of a sheet: short of the next one, so only the snap can carry the row there.
      await page.mouse.wheel(Math.round((start.rowRight - start.rowLeft) / 3), 0);
      expect(inSlack(await settled(page), 1)).toBe(true);

      // A short scroll with no wheel behind it (a scrollbar drag, a keyboard step) settles by the
      // snap alone. Firefox rested the second sheet 2px past the row's edge that way.
      await page.evaluate(() => {
        const row = document.querySelector<HTMLElement>('[data-paper-stack-root]')!;
        row.scrollTo({ left: 0, behavior: 'instant' });
        row.scrollBy({ left: 100, behavior: 'instant' });
      });
      expect(inSlack(await settled(page), 1)).toBe(true);

      await page.evaluate(() => {
        const row = document.querySelector<HTMLElement>('[data-paper-stack-root]')!;
        row.scrollTo({ left: row.scrollWidth, behavior: 'instant' });
      });
      expect(inSlack(await settled(page), -1)).toBe(true);
    });
  });
}
