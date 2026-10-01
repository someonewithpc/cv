import { expect, test } from '@playwright/test';

test('the favicon review page loads candidates 6 to 8', async ({ page }) => {
  await page.goto('/favicon-candidates/');
  for (let n = 6; n <= 8; n++) {
    const img = page.locator(`img[src$="favicon-candidates/${n}.svg"]`).first();
    await expect(img).toBeVisible();
    expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  }
});
