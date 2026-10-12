import { expect, test } from '@playwright/test';

test('the Bill of materials count writes the picked filter as live text', async ({ page }) => {
  await page.goto('/');
  const status = page.locator('#bill-of-materials [role="status"]');

  await page.locator('label[for="tech-filter-software"]').click();
  await expect(status).toHaveText(/^\d+ software$/);

  await page.locator('label[for="tech-filter-hardware"]').click();
  await expect(status).toHaveText(/^\d+ hardware & CAD$/);

  await page.locator('label[for="tech-filter-all"]').click();
  await expect(status).toHaveText(/^\d+ skills$/);
});
