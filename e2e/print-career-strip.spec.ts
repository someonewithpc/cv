import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 1000 } });

// When a whole row moves to the next page, the table's own frame and fill would print around the
// space it leaves. On paper the cells carry the hairlines and the table draws nothing.
test('the printed career table draws no frame or fill of its own, its cells do', async ({ page }) => {
  await page.goto('/');
  await page.emulateMedia({ media: 'print' });

  const table = page.locator('#career .table');
  await expect(table).toHaveCSS('border-top-style', 'none');
  await expect(table).toHaveCSS('border-bottom-style', 'none');
  await expect(table).toHaveCSS('border-left-style', 'none');
  await expect(table).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

  for (const cell of [page.locator('#career .table .head > *').first(), page.locator('#career .table .row > .description').last()]) {
    await expect(cell).toHaveCSS('outline-style', 'solid');
    await expect(cell).toHaveCSS('outline-width', '1px');
  }
});

test('on screen the career table keeps its own frame', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#career .table')).toHaveCSS('border-top-style', 'solid');
});
