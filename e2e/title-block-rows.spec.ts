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

/**
 * Widths where the ladder sheds cells. On a sheet whose artwork leaves room in the corner, the
 * block keeps them, so wherever a cell is shed, the block with that cell back would run into
 * the artwork (or the note's tab), half a rem of clear paper kept.
 */
const SHED_WIDTHS = [688, 704, 720, 744, 768, 800, 832, 856];

test('the title block sheds a cell only where the artwork leaves no room for it', async ({ page }) => {
  // Every cell shows here, in the block's narrow type, so each one's natural width can be read.
  await page.setViewportSize({ width: 880, height: 900 });
  await page.goto('/');
  await expect(page.locator('article.technical-drawing-stack').first()).toBeVisible();
  await expect(page.locator('[data-paper-stack-root]:not([aria-roledescription="paper stack"])')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);

  const natural = await page.locator('section > table').evaluateAll((tables) => tables.map((table) => {
    const range = document.createRange();
    return Object.fromEntries([...table.querySelectorAll<HTMLElement>('td')].map((cell) => {
      const name = [...cell.classList].find((c) => c.startsWith('title-'))?.slice(6) ?? '?';
      const style = getComputedStyle(cell);
      let content = 0;
      for (const text of cell.querySelectorAll('span:not(.sr-only), h2, h3, svg')) {
        range.selectNodeContents(text);
        content = Math.max(content, text instanceof SVGElement ? text.getBoundingClientRect().width : range.getBoundingClientRect().width);
      }
      return [name, content + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 1];
    }));
  }));

  const crowded: string[] = [];
  for (const width of SHED_WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(done)))));

    const found = await page.locator('section > table').evaluateAll((tables, cells) => tables.flatMap((table, index) => {
      const sheet = table.parentElement as HTMLElement;
      // The front page only: it lies square, so its client rects are its layout.
      if (!sheet.closest('.paper-front')) return [];
      const shown = (name: string) => {
        const cell = table.querySelector<HTMLElement>(`td.title-${name}`);
        return cell !== null && getComputedStyle(cell).display !== 'none';
      };
      // The one the block would take back first: the ladder sheds Proj., then Scale, then Weight.
      const back = ['weight', 'scale', 'proj'].find((name) => !shown(name) && name in cells[index]);
      if (!back) return [];

      const block = table.getBoundingClientRect();
      const em = parseFloat(getComputedStyle(table).fontSize);
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      // The tallest the block runs when it takes a cell back: logo and title stacked, the
      // title on two lines.
      const top = block.bottom - 10 * em - 0.5 * rem;
      const range = document.createRange();
      const inkBoxes: DOMRect[] = [];
      const tab = sheet.querySelector(':scope > .aside .note-fold');
      if (tab) inkBoxes.push(tab.getBoundingClientRect());
      for (const el of sheet.querySelectorAll(':scope > .content *')) {
        if (el instanceof SVGElement) {
          if (el.parentElement instanceof SVGSVGElement && !(el instanceof SVGSVGElement)) inkBoxes.push(el.getBoundingClientRect());
          continue;
        }
        if (el.children.length === 0 || [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())) {
          range.selectNodeContents(el);
          inkBoxes.push(el.children.length === 0 && !el.textContent?.trim() ? el.getBoundingClientRect() : range.getBoundingClientRect());
        }
        const style = getComputedStyle(el);
        if (parseFloat(style.borderLeftWidth) > 0 || parseFloat(style.borderRightWidth) > 0
          || !/^(transparent|rgba\(.*,\s*0\))$/.test(style.backgroundColor)) inkBoxes.push(el.getBoundingClientRect());
      }
      const sheetBox = sheet.getBoundingClientRect();
      const edge = Math.max(sheetBox.left, ...inkBoxes
        .filter((box) => box.width > 0 && box.height > 0)
        .filter((box) => !(box.width > sheetBox.width * 0.9 && box.height > sheetBox.height * 0.9))
        .filter((box) => box.bottom > top && box.top < block.bottom && box.left < block.right)
        .map((box) => Math.min(box.right, block.right)));
      const room = block.right - edge - 0.5 * rem;
      const wanted = block.width + cells[index][back];

      // Two pixels for the canvas and the range measuring the same words a little apart.
      return wanted > room - 2 ? [] : [`${table.querySelector('h2')?.textContent?.trim()}: sheds ${back} with ${Math.round(room - block.width)}px to spare, the cell is ${Math.round(cells[index][back])}px`];
    }), natural);
    crowded.push(...found.map((line) => `${width}px ${line}`));
  }

  expect(crowded).toEqual([]);
});
