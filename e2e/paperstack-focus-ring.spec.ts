import { expect, test } from '@playwright/test';

import { frontPage, frontPageIndex, frontPageName } from './support/paperStack';

/** The sheet inside a page wrapper: the fold flap and its friends ride on top of it. */
const SHEET = ':scope > :not(.paper-fold, .paper-back-grab, .paper-clip, .paper-clip-under, .paper-flip-hint)';

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

  // The stack's box wraps the whole fan, and the wrapper does not carry the crease,
  // so the ring goes on the sheet: drawn inside its edge, the clip-path cuts it.
  await expect(stack).toHaveCSS('outline-style', 'none');
  const front = frontPage(stack, await frontPageIndex(stack));
  await expect(front).toHaveCSS('outline-style', 'none');

  const sheet = front.locator(SHEET);
  await expect(sheet).toHaveCSS('outline-style', 'solid');
  await expect(sheet).toHaveCSS('outline-width', '2px');
  await expect(sheet).toHaveCSS('outline-offset', '-2px');
  // The cut the ring follows is on this element, not on the wrapper.
  expect(await sheet.evaluate((el) => getComputedStyle(el).clipPath)).toContain('polygon');

  // The dog-ear is clipped paper too, so it wears the same ring along its folded edges.
  const flap = front.locator(':scope > .paper-fold');
  await expect(flap).toHaveCSS('outline-style', 'solid');
  await expect(flap).toHaveCSS('outline-width', '2px');
  // The paper clip only rides over the paper, so it keeps out of the ring.
  await expect(front.locator(':scope > .paper-clip')).toHaveCSS('outline-style', 'none');

  const firstName = await frontPageName(stack);
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => frontPageName(stack), { timeout: 15_000 }).not.toBe(firstName);

  await expect(frontPage(stack, await frontPageIndex(stack)).locator(SHEET)).toHaveCSS('outline-style', 'solid');
  await expect(sheet).toHaveCSS('outline-style', 'none');
});
