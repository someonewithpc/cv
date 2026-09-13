import { expect, test } from '@playwright/test';

import { frontPage, frontPageIndex, swipeToPage } from './support/paperStack';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

function visrezStack(page: import('@playwright/test').Page) {
  return page.locator('article.technical-drawing-stack').nth(0);
}

test('main page: the loading-logo SVG renders and its dash animation runs', async ({ page }) => {
  const stack = visrezStack(page);
  await stack.scrollIntoViewIfNeeded();
  const front = frontPage(stack, await frontPageIndex(stack));

  const svg = front.locator('svg').first();
  await expect(svg).toBeVisible();

  const animatedPath = front.locator('svg [style*="dash-animation"]').first();
  const animationName = await animatedPath.evaluate((el) => getComputedStyle(el).animationName);
  expect(animationName).not.toBe('none');
});

test('original-logo page: the unoptimized original SVG is shown', async ({ page }) => {
  const stack = visrezStack(page);
  await stack.scrollIntoViewIfNeeded();
  await swipeToPage(page, stack, 'Original Logo');
  const front = frontPage(stack, await frontPageIndex(stack));
  await expect(front.locator('svg').first()).toBeVisible();
});

test('cube page: the 3-face cube diagram is shown', async ({ page }) => {
  const stack = visrezStack(page);
  await stack.scrollIntoViewIfNeeded();
  await swipeToPage(page, stack, 'Cube :)');
  const front = frontPage(stack, await frontPageIndex(stack));
  await expect(front.locator('svg').first()).toBeVisible();
});

test('authored-path page: the hand-authored path diagram is shown', async ({ page }) => {
  const stack = visrezStack(page);
  await stack.scrollIntoViewIfNeeded();
  await swipeToPage(page, stack, 'Authored Path');
  const front = frontPage(stack, await frontPageIndex(stack));
  await expect(front.locator('svg.path-layer')).toBeVisible();
});

test('path-data page: the annotated SVG source listing is shown', async ({ page }) => {
  const stack = visrezStack(page);
  await stack.scrollIntoViewIfNeeded();
  await swipeToPage(page, stack, 'Path Data');
  const front = frontPage(stack, await frontPageIndex(stack));
  await expect(front.locator('pre.path-data-layer')).toBeVisible();
  await expect(front.locator('pre.path-data-layer')).toContainText('<svg');
});

test('all-together page: the combined face diagram is shown', async ({ page }) => {
  const stack = visrezStack(page);
  await stack.scrollIntoViewIfNeeded();
  await swipeToPage(page, stack, 'Putting it all together');
  const front = frontPage(stack, await frontPageIndex(stack));
  await expect(front.locator('svg.face')).toBeVisible();
});
