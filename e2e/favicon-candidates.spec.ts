import { expect, test } from '@playwright/test';

test('the favicon review page loads all five candidates', async ({ page }) => {
  await page.goto('/favicon-candidates/');
  for (let n = 1; n <= 5; n++) {
    const img = page.locator(`img[src$="favicon-candidates/${n}.svg"]`).first();
    await expect(img).toBeVisible();
    expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  }
});
