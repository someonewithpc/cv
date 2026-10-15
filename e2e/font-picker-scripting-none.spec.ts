import { expect, test } from '@playwright/test';

test.use({ javaScriptEnabled: false });

test('with scripts off, the font picker loading placeholders are hidden', async ({ page }) => {
  await page.goto('/');

  for (const island of ['[data-font-picker-island]', '[data-held-controls-island]']) {
    const placeholder = page.locator(`${island} .boot-placeholder`).first();
    await expect(placeholder).toBeAttached();
    expect(await placeholder.evaluate((el) => getComputedStyle(el).display)).toBe('none');
  }
});
