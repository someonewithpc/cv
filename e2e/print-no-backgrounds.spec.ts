import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 1000 } });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.emulateMedia({ media: 'print' });
});

test('the career sheet prints no dot grid and no tint', async ({ page }) => {
  const career = page.locator('#career');
  await expect(career).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  const grid = await career.evaluate((el) => getComputedStyle(el, '::before').display);
  expect(grid).toBe('none');
});

test('the table head, the cells and the highlight cards print no fill and keep their hairlines', async ({ page }) => {
  const cells = page.locator('#career .table .head > *, #career .table .row > *, #career .cells .cell');
  expect(await cells.count()).toBeGreaterThan(10);
  const styles = await cells.evaluateAll((els) =>
    els.map((el) => {
      const cs = getComputedStyle(el);
      return { fill: cs.backgroundColor, outline: `${cs.outlineStyle} ${cs.outlineWidth}` };
    }),
  );
  for (const style of styles) {
    expect(style).toEqual({ fill: 'rgba(0, 0, 0, 0)', outline: 'solid 1px' });
  }

  for (const box of await page.locator('#career .table, #career .cells').all()) {
    await expect(box).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(box).toHaveCSS('border-top-width', '1px');
  }

  const cards = page.locator('#open-source .intro article');
  expect(await cards.count()).toBeGreaterThan(0);
  for (const card of await cards.all()) {
    await expect(card).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(card).toHaveCSS('border-top-width', '1px');
  }
});
