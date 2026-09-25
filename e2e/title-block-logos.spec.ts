import { expect, test } from '@playwright/test';

/**
 * The logo cell of every title block centres its logos, one or an overlapping pair, on both
 * axes. Measured on the page with every tilt taken off, so a page's own tilt in the stack does
 * not count. Offsets would do that too, but they round to whole pixels and a phone sheet's
 * logo stack measures from the block, not its cell, which put a centred pair 1.5px off once a
 * two-line title made the cell 64.9px tall. 390 is the phone sheet; 1240 the cornered block on
 * a desktop sheet.
 */
for (const [width, height] of [[390, 844], [1240, 620]]) {
  test(`title block logos sit in their cell's centre at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.addStyleTag({ content: '* { rotate: none !important; transform: none !important; translate: none !important; }' });

    const cells = page.locator('td.title-tech');
    expect(await cells.count()).toBeGreaterThan(0);

    const offCentre = await cells.evaluateAll((all) => all.flatMap((td) => {
      const stack = td.querySelector<HTMLElement>('.title-tech-stack');
      const icons = [...td.querySelectorAll<HTMLElement>('.tech-icon')];
      if (!stack || icons.length === 0) return ['a logo cell without logos'];

      const cell = td.getBoundingClientRect();
      const rects = icons.map((i) => i.getBoundingClientRect());
      const left = Math.min(...rects.map((r) => r.left));
      const right = Math.max(...rects.map((r) => r.right));
      const top = Math.min(...rects.map((r) => r.top));
      const bottom = Math.max(...rects.map((r) => r.bottom));
      const dx = (left + right) / 2 - (cell.left + cell.right) / 2;
      const dy = (top + bottom) / 2 - (cell.top + cell.bottom) / 2;
      if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) return [];

      const title = td.closest('section')?.querySelector('h2')?.textContent?.trim() ?? '?';
      return [`${title}: ${dx.toFixed(1)}, ${dy.toFixed(1)}px off`];
    }));

    expect(offCentre).toEqual([]);
  });
}

/**
 * On a portrait sheet the block has the bottom row to itself but keeps its own size in the
 * corner. Stretched to the row, the logo cell grew wide and empty and slid under the note's
 * dog-eared corner at the bottom left.
 */
test('a portrait title block fits its content and clears the note corner', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/');
  // Boxes are compared on the page, so the stacks lie flat for it.
  await page.addStyleTag({ content: '* { rotate: none !important; transform: none !important; translate: none !important; }' });

  const cells = page.locator('td.title-tech');
  expect(await cells.count()).toBeGreaterThan(0);

  const wrong = await cells.evaluateAll((all) => all.flatMap((td) => {
    const title = td.closest('section')?.querySelector('h2')?.textContent?.trim() ?? '?';
    const block = td.closest('table')!;
    const section = block.parentElement!;
    const stack = td.querySelector<HTMLElement>('.title-tech-stack')!;
    const found: string[] = [];

    const cs = getComputedStyle(td);
    const room = td.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if (room > stack.offsetWidth + 1) {
      found.push(`${title}: logo cell ${room.toFixed(1)}px for a ${stack.offsetWidth}px stack`);
    }

    const fold = section.querySelector<HTMLElement>('.note-fold');
    if (fold && getComputedStyle(fold).display !== 'none') {
      // The corner is a right triangle on the sheet's bottom-left, its legs the fold's size.
      const box = block.getBoundingClientRect();
      const corner = fold.getBoundingClientRect();
      const into = corner.width - (box.left - corner.left) - (corner.bottom - box.bottom);
      if (into > 0) found.push(`${title}: block reaches ${into.toFixed(1)}px under the note corner`);
    }
    return found;
  }));

  expect(wrong).toEqual([]);
});
