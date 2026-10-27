import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 1000 } });

for (const filter of ['all', 'software', 'hardware']) {
  test(`print drops the skills filter and shows every chip whatever ${filter} was picked`, async ({ page }) => {
    await page.goto('/');
    await page.locator('#bill-of-materials').scrollIntoViewIfNeeded();
    await page.locator(`label[for="tech-filter-${filter}"]`).click();
    await page.emulateMedia({ media: 'print' });

    const section = page.locator('#bill-of-materials');
    await expect(section.locator('.filter-toggle')).toBeHidden();
    await expect(section.locator('.filter-count')).toBeHidden();
    await expect(section.locator('.print-count')).toHaveText(/^\d+ skills$/);

    const chips = section.locator('li');
    const total = await chips.count();
    await expect(section.locator('.print-count')).toHaveText(`${total} skills`);
    for (const li of await chips.all()) {
      await expect(li).toBeVisible();
      await expect(li).toHaveCSS('opacity', '1');
      await expect(li).toHaveCSS('filter', 'none');
    }
  });
}

test('the print count is not on screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#bill-of-materials .print-count')).toBeHidden();
  await expect(page.locator('#bill-of-materials .filter-toggle')).toBeVisible();
});
