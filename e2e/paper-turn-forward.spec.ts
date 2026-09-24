import { expect, test } from '@playwright/test';

import { demoStack, frontPageName, swipeStack } from './support/paperStack';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('marker editor: one flick turns the page away and the same flick brings it back', async ({ page }) => {
  const stack = demoStack(page, 'Interactive Map Marker Editor');
  await stack.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  // A third of the stack's diagonal is about what a trackpad flick hands over, and both
  // directions commit on a quarter of it. Sending a page away used to ask for half, so this
  // turned the pages back but never forward.
  await swipeStack(page, stack, true, 0.35);
  expect(await frontPageName(stack)).toBe('Marker Selector');

  await swipeStack(page, stack, false, 0.35);
  expect(await frontPageName(stack)).toBe('Interactive Map Marker Editor');
});
