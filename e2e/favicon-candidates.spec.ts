import { expect, test } from '@playwright/test';

test('the favicon review page loads candidates 6 to 8 and 12 to 14', async ({ page }) => {
  await page.goto('/favicon-candidates/');
  for (const n of [6, 7, 8, 12, 13, 14]) {
    const img = page.locator(`img[src$="favicon-candidates/${n}.svg"]`).first();
    await expect(img).toBeVisible();
    expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  }
});
