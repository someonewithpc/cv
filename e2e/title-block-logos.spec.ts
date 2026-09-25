import { expect, test } from '@playwright/test';

/**
 * The logo cell of every title block centres its logos, one or an overlapping pair, on both
 * axes. Measured in layout offsets so a page's own tilt in the stack does not count. 390 is the
 * phone sheet, where the block runs the sheet's width and the cell with it; 1240 the cornered
 * block on a desktop sheet.
 */
for (const [width, height] of [[390, 844], [1240, 620]]) {
  test(`title block logos sit in their cell's centre at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');

    const cells = page.locator('td.title-tech');
    expect(await cells.count()).toBeGreaterThan(0);

    const offCentre = await cells.evaluateAll((all) => all.flatMap((td) => {
      const stack = td.querySelector<HTMLElement>('.title-tech-stack');
      const icons = [...td.querySelectorAll<HTMLElement>('.tech-icon')];
      if (!stack || icons.length === 0) return ['a logo cell without logos'];

      const left = Math.min(...icons.map((i) => i.offsetLeft));
      const right = Math.max(...icons.map((i) => i.offsetLeft + i.offsetWidth));
      const top = Math.min(...icons.map((i) => i.offsetTop));
      const bottom = Math.max(...icons.map((i) => i.offsetTop + i.offsetHeight));
      const dx = stack.offsetLeft + (left + right) / 2 - td.clientWidth / 2;
      const dy = stack.offsetTop + (top + bottom) / 2 - td.clientHeight / 2;
      if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) return [];

      const title = td.closest('section')?.querySelector('h2')?.textContent?.trim() ?? '?';
      return [`${title}: ${dx.toFixed(1)}, ${dy.toFixed(1)}px off`];
    }));

    expect(offCentre).toEqual([]);
  });
}
