import { expect, test } from '@playwright/test';

/**
 * Hugo's 697px window, where the block had stacked its cells and left the row under the title
 * a stub at its left end with the page's dog-ear over the title's right end, a width inside
 * each step the block sheds its parts in, and a phone, whose block has a row of its own.
 */
const WIDTHS = [390, 600, 697, 760, 900, 1024];

test.use({ reducedMotion: 'reduce' });

type Block = { title: string; rows: string[]; ragged: boolean; underFold: string[] };

for (const width of WIDTHS) {
  test(`every title block is one table clear of the dog-ear at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const stacks = page.locator('article.technical-drawing-stack');
    await expect(stacks.first()).toBeVisible();
    await expect(page.locator('[data-paper-stack-root]:not([aria-roledescription="paper stack"])')).toHaveCount(0);

    const blocks: Block[] = await page.locator('section > table').evaluateAll((tables) => tables.map((table) => {
      const section = table.closest('section')!;
      const sheet = section.parentElement!;

      // Layout boxes, not client rects: every page but the front one is turned a little.
      const cells = [...table.querySelectorAll<HTMLElement>('td')]
        .filter((cell) => getComputedStyle(cell).display !== 'none' && cell.offsetWidth > 0)
        .map((cell) => ({
          name: [...cell.classList].find((c) => c.startsWith('title-')) ?? cell.className,
          left: cell.offsetLeft,
          right: cell.offsetLeft + cell.offsetWidth,
          top: cell.offsetTop,
          bottom: cell.offsetTop + cell.offsetHeight,
        }));

      // A row is every cell that crosses a line through its top, a cell spanning both rows
      // included, so each row's edges are the block's own at that height.
      const tops = [...new Set(cells.map((cell) => cell.top))].sort((a, b) => a - b);
      const rows = tops.map((top) => {
        const on = cells.filter((cell) => cell.top <= top + 2 && cell.bottom > top + 2);
        return { left: Math.min(...on.map((c) => c.left)), right: Math.max(...on.map((c) => c.right)) };
      });
      const ragged = rows.some((row) => Math.abs(row.left - rows[0].left) > 1 || Math.abs(row.right - rows[0].right) > 1);

      // The table's place on the page, from the page's bottom-right corner.
      let x = 0;
      let y = 0;
      for (let at: HTMLElement | null = table as HTMLElement; at && at !== sheet; at = at.offsetParent as HTMLElement | null) {
        x += at.offsetLeft;
        y += at.offsetTop;
      }
      const length = (name: string) => {
        const probe = document.createElement('div');
        probe.style.cssText = `position: absolute; width: var(${name}, 0px)`;
        sheet.append(probe);
        const value = probe.getBoundingClientRect().width;
        probe.remove();
        return value;
      };

      // The dog-ear at rest: the corner the crease cuts off, and the flap folded over from it,
      // whose tip is the corner mirrored in the crease.
      const foldX = length('--fold-rest-x');
      const foldY = length('--fold-rest-y');
      const k = 2 / (1 / foldX ** 2 + 1 / foldY ** 2);
      const fold = [[0, 0], [foldX, 0], [k / foldX, k / foldY], [0, foldY]];

      const covers = (box: number[][]) => [[1, 0], [0, 1], ...fold.map(([ax, ay], i) => {
        const [bx, by] = fold[(i + 1) % fold.length];
        return [ay - by, bx - ax];
      })].every(([nx, ny]) => {
        const a = fold.map(([px, py]) => px * nx + py * ny);
        const b = box.map(([px, py]) => px * nx + py * ny);
        return Math.max(...a) > Math.min(...b) && Math.max(...b) > Math.min(...a);
      });

      // The Proj. cell is sized to take the dog-ear; nothing else may go under it.
      const underFold = foldX === 0 ? [] : cells.filter((cell) => cell.name !== 'title-proj').filter((cell) => {
        const near = sheet.offsetWidth - (x + cell.right);
        const far = sheet.offsetWidth - (x + cell.left);
        const low = sheet.offsetHeight - (y + cell.bottom);
        const high = sheet.offsetHeight - (y + cell.top);
        return covers([[near, low], [far, low], [far, high], [near, high]]);
      }).map((cell) => cell.name);

      return {
        title: table.querySelector('h2')?.textContent?.trim() ?? '?',
        rows: rows.map((row) => `${row.left}-${row.right}`),
        ragged,
        underFold,
      };
    }));

    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.filter((block) => block.ragged).map((block) => `${block.title}: ${block.rows.join(' / ')}`)).toEqual([]);
    expect(blocks.filter((block) => block.underFold.length > 0).map((block) => `${block.title}: ${block.underFold.join(', ')}`)).toEqual([]);
  });
}
