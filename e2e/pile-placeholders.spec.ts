import { expect, test } from '@playwright/test';

import { demoStack, settledAfter } from './support/paperStack';

/**
 * The islands behind the front page of a stack keep their boot placeholder until a turn brings
 * them up. At rest those placeholders are not painted (Layout.astro): painted, each one's
 * solid panel after the sheet's grain blend made Chrome give every page in the stack a
 * compositor layer of its own. The gate is data-paper-moving on the stack (fold-drag.ts), set
 * the moment a hand or a key starts a turn and dropped when the page settles, so a page on its
 * way up shows its placeholder as it always did.
 */
test('pile placeholders stay unpainted at rest and show while a page moves', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');

  const stack = demoStack(page, 'Space Builder · Add Tool');
  await stack.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);

  const pile = stack.locator(':scope > :not(.paper-front) .boot-placeholder');
  expect(await pile.count()).toBeGreaterThan(0);
  const visibilities = () => pile.evaluateAll((els) => els.map((el) => getComputedStyle(el).visibility));

  await expect(stack).not.toHaveAttribute('data-paper-moving');
  expect(await visibilities()).toEqual(Array(await pile.count()).fill('hidden'));

  await stack.focus();
  await settledAfter(stack, async () => {
    await page.keyboard.press('ArrowRight');
    await expect(stack).toHaveAttribute('data-paper-moving', '');
    expect(new Set(await visibilities())).toEqual(new Set(['visible']));
  });

  await expect(stack).not.toHaveAttribute('data-paper-moving');
  expect(new Set(await visibilities())).toEqual(new Set(['hidden']));
});
