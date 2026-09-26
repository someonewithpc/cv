import { expect, test } from '@playwright/test';

/**
 * A phone, each step of the ladder the block drops its cells in, the stacked step (688 to
 * 728) at every 8px, and the widths past it. The four themes lay the block out alike.
 */
const WIDTHS = [390, 600, 680, 688, 696, 704, 712, 720, 728, 736, 768, 800, 900, 1024, 1440];

test.use({ reducedMotion: 'reduce' });

test('every title block fills its rows with cells at every width', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await expect(page.locator('article.technical-drawing-stack').first()).toBeVisible();
  await expect(page.locator('[data-paper-stack-root]:not([aria-roledescription="paper stack"])')).toHaveCount(0);

  const gaps: string[] = [];
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));

    const found = await page.locator('section > table').evaluateAll((tables) => tables.flatMap((table) => {
      // Layout boxes, not client rects: every page but the front one is turned a little.
      const cells = [...table.querySelectorAll<HTMLElement>('td')]
        .filter((cell) => getComputedStyle(cell).display !== 'none' && cell.offsetWidth > 0)
        .map((cell) => ({
          name: [...cell.classList].find((c) => c.startsWith('title-')) ?? cell.className,
          left: cell.offsetLeft,
          top: cell.offsetTop,
          right: cell.offsetLeft + cell.offsetWidth,
          bottom: cell.offsetTop + cell.offsetHeight,
        }));
      const width = (table as HTMLElement).offsetWidth;
      const height = (table as HTMLElement).offsetHeight;
      const title = table.querySelector('h2')?.textContent?.trim() ?? '?';

      // Each row, a cell spanning both included, runs from the block's left edge to its right,
      // give or take the collapsed hairlines.
      const rows = [...new Set(cells.map((cell) => cell.top))].sort((a, b) => a - b).map((top) => {
        const on = cells.filter((cell) => cell.top <= top + 2 && cell.bottom > top + 2);
        return [Math.min(...on.map((c) => c.left)), Math.max(...on.map((c) => c.right))];
      });
      const ragged = rows.some(([left, right]) => left > 2 || right < width - 2);

      // And no point of the block's box, its hairlines aside, is left outside every cell.
      let empty = 0;
      for (let y = 2; y < height - 2; y += 2) {
        for (let x = 2; x < width - 2; x += 2) {
          if (!cells.some((c) => x >= c.left - 1 && x <= c.right + 1 && y >= c.top - 1 && y <= c.bottom + 1)) empty += 1;
        }
      }

      return ragged || empty > 0
        ? [`${title}: block ${width}px, rows ${rows.map((r) => r.join('-')).join(' / ')}, ${empty} empty points (${cells.map((c) => c.name).join(', ')})`]
        : [];
    }));
    gaps.push(...found.map((gap) => `${width}px ${gap}`));
  }

  expect(gaps).toEqual([]);
});
