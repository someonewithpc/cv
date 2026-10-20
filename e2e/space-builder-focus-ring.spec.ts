import { expect, test } from '@playwright/test';

import { demoStack } from './support/paperStack';

// The controls in the ported Space Builder panels draw the scene's 2px brand ring on keyboard
// focus, as the rail buttons do, not the browser's own thin ring.
for (const [label, control] of [
  ['Space Builder · Add Tool', 'button.sidebar-close'],
  ['Space Builder · Object Variants', 'summary.hover-select-current'],
] as const) {
  test(`${label}: ${control} takes the brand focus ring`, async ({ page }) => {
    await page.goto('/');
    const stack = demoStack(page, label);
    await stack.scrollIntoViewIfNeeded();
    const target = stack.locator(control).first();
    await expect(target).toBeVisible({ timeout: 15_000 });

    // Tab in rather than call focus(): :focus-visible only matches focus the keyboard gave.
    await stack.focus();
    for (let i = 0; i < 20; i += 1) {
      await page.keyboard.press('Tab');
      if (await target.evaluate((el) => el === document.activeElement)) break;
    }
    expect(await target.evaluate((el) => el === document.activeElement)).toBe(true);
    await expect(target).toHaveCSS('outline-style', 'solid');
    await expect(target).toHaveCSS('outline-width', '2px');
    await expect(target).toHaveCSS('outline-color', 'rgb(137, 171, 36)');
  });
}
