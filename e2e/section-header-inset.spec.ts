import { expect, test } from '@playwright/test';

/** The narrowest page gutter, clamp(0.75rem, ...) in Layout.astro, against a 16px root. */
const MIN_INSET = 12;

for (const width of [360, 390, 820, 1024, 1280]) {
  test(`the Open Source title sits inside its card at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');

    const insets = await page.locator('#open-source .intro').evaluate((card) => {
      const box = card.getBoundingClientRect();
      const rect = (selector: string) => card.querySelector(selector)!.getBoundingClientRect();
      const code = rect('.sheet-code');
      return {
        codeTop: code.top - box.top,
        lefts: ['.sheet-code', '#open-source-heading [lang=ja]', '#open-source-heading .typewriter'].map(
          (selector) => rect(selector).left - box.left,
        ),
      };
    });

    expect(insets.codeTop).toBeGreaterThanOrEqual(MIN_INSET);
    for (const left of insets.lefts) expect(left).toBeGreaterThanOrEqual(MIN_INSET - 2);
  });
}
