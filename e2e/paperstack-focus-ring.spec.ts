import { expect, test } from '@playwright/test';

import { frontPage, frontPageIndex, frontPageName } from './support/paperStack';

test('visrez logo animation: the keyboard focus ring sits on the front sheet and follows a page turn', async ({ page }) => {
  await page.goto('/');

  const stack = page.locator('article.technical-drawing-stack').first();
  await stack.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  // Tab in rather than call focus(): :focus-visible only matches focus the keyboard gave.
  for (let i = 0; i < 15; i += 1) {
    await page.keyboard.press('Tab');
    if (await stack.evaluate((el) => el === document.activeElement)) break;
  }
  expect(await stack.evaluate((el) => el === document.activeElement)).toBe(true);

  // The stack's box wraps the whole fan, so the ring belongs to the sheet on top of it.
  await expect(stack).toHaveCSS('outline-style', 'none');
  const front = frontPage(stack, await frontPageIndex(stack));
  await expect(front).toHaveCSS('outline-style', 'solid');
  await expect(front).toHaveCSS('outline-width', '2px');

  const firstName = await frontPageName(stack);
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => frontPageName(stack), { timeout: 15_000 }).not.toBe(firstName);

  await expect(frontPage(stack, await frontPageIndex(stack))).toHaveCSS('outline-style', 'solid');
  await expect(front).toHaveCSS('outline-style', 'none');
});
