import { expect, test } from '@playwright/test';

import { frontPageIndex, frontPageName, swipeStack } from './support/paperStack';

const DEMOS = [
  {
    label: 'Visrez logo animation',
    stackIndex: 0,
    pages: [
      'Visrez Animated Loading Logo',
      'Original Logo',
      'Cube :)',
      'Authored Path',
      'Path Data',
      'Putting it all together',
    ],
  },
  {
    label: 'Marker editor',
    stackIndex: 1,
    pages: [
      'Interactive Map Marker Editor',
      'Marker Selector',
      'Marker Editor',
      'Preview Background',
      'Composable Parts',
      'Undoable Store',
    ],
  },
  {
    label: 'Space builder',
    stackIndex: 2,
    pages: [
      'Space Builder · Add Tool',
      'Place Area',
      'Edit Parameters',
      'Layout Styles',
      'Capacity Badge',
      'Drag & Drop',
    ],
  },
];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

for (const demo of DEMOS) {
  test(`${demo.label}: forward swipes visit every page in order, then wrap`, async ({ page }) => {
    const stack = page.locator('article.technical-drawing-stack').nth(demo.stackIndex);
    await stack.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    expect(await stack.locator(':scope > div').count()).toBe(demo.pages.length);
    expect(await frontPageIndex(stack)).toBe(0);
    expect(await frontPageName(stack)).toBe(demo.pages[0]);

    for (let i = 1; i < demo.pages.length; i += 1) {
      await swipeStack(page, stack, true);
      expect(await frontPageName(stack), `page ${i} after ${i} forward swipe(s)`).toBe(demo.pages[i]);
    }

    // One more forward swipe past the last page wraps back to the first.
    await swipeStack(page, stack, true);
    expect(await frontPageName(stack)).toBe(demo.pages[0]);
  });
}

test('marker editor: backward swipe is clamped at the first page', async ({ page }) => {
  const stack = page.locator('article.technical-drawing-stack').nth(1);
  await stack.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  expect(await frontPageName(stack)).toBe('Interactive Map Marker Editor');

  // Nothing behind the front page — a backward swipe here is a no-op, not a wrap.
  await swipeStack(page, stack, false);
  expect(await frontPageName(stack)).toBe('Interactive Map Marker Editor');
  await swipeStack(page, stack, false);
  expect(await frontPageName(stack)).toBe('Interactive Map Marker Editor');
});

test('marker editor: one flick turns the page away and the same flick brings it back', async ({ page }) => {
  const stack = page.locator('article.technical-drawing-stack').nth(1);
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

test('marker editor: a forward swipe then a backward swipe returns to the start', async ({ page }) => {
  const stack = page.locator('article.technical-drawing-stack').nth(1);
  await stack.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  await swipeStack(page, stack, true);
  expect(await frontPageName(stack)).toBe('Marker Selector');

  await swipeStack(page, stack, false);
  expect(await frontPageName(stack)).toBe('Interactive Map Marker Editor');
});
