import { expect, test, type Locator, type Page } from '@playwright/test';

import {
  armDrawCounter,
  frontPage,
  frontPageIndex,
  frontPageName,
  sceneDraws,
  swipeToPage,
  waitForIslandMounted,
} from './support/paperStack';

/** Fourth stack on the page: logo, marker editor, space builder, then this one. */
function variantsStack(page: Page) {
  return page.locator('article.technical-drawing-stack').nth(3);
}

async function openDemo(page: Page): Promise<Locator> {
  const stack = variantsStack(page);
  await stack.scrollIntoViewIfNeeded();
  const front = frontPage(stack, await frontPageIndex(stack));
  const island = await waitForIslandMounted(front);
  const app = island.locator('[data-ready]');
  await expect(app).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  // Focus hands the demo over from its autoplay loop, which would otherwise keep clicking
  // the same controls this test drives.
  await app.focus();
  await expect(app).toHaveAttribute('data-user-control', 'true');
  return app;
}

function card(app: Locator, id: string) {
  return app.locator(`[data-catalog-item="${id}"]`);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('the picker mounts on the scene with both catalog cards', async ({ page }) => {
  const app = await openDemo(page);

  await expect(card(app, 'chair')).toBeVisible();
  await expect(card(app, 'table-round')).toBeVisible();
  // The chair's finishes share seat count and size, so they are one cell: a carousel, not
  // a pair of dropdowns.
  await expect(card(app, 'chair').locator('.hover-select')).toHaveCount(0);
  await expect(card(app, 'chair').locator('button.next')).toBeVisible();
});

test('stepping the carousel swaps the model on the floor', async ({ page }) => {
  await armDrawCounter(page);
  const app = await openDemo(page);

  const chair = card(app, 'chair');
  const thumb = chair.locator('.object-icons img');
  const before = await thumb.getAttribute('src');
  const counter = chair.locator('.group-object-count span').first();
  await expect(counter).toContainText('1');

  await chair.locator('button.next').click();
  await expect(counter).toContainText('2');
  // Each finish is its own render in the library, so the card's image changes with it.
  expect(await thumb.getAttribute('src')).not.toBe(before);

  const drawsBefore = await sceneDraws(app);
  await page.waitForTimeout(1500);
  expect(await sceneDraws(app)).toBeGreaterThan(drawsBefore);
});

test('a size with no object at the current seat count falls back', async ({ page }) => {
  const app = await openDemo(page);

  const set = card(app, 'table-round');
  const seats = set.locator('.object-pax');
  const size = set.locator('.object-size');
  await expect(seats.locator('.hover-select-current')).toContainText('8 seats');

  await size.locator('.hover-select-current').click();
  const smaller = size.locator('.hover-select-options li').nth(1);
  await expect(smaller).toHaveClass(/unavailable/);
  await smaller.click();

  // Eight seats has no smaller table, so the seat count moves with the size.
  await expect(size.locator('.hover-select-current')).toContainText('1.82m');
  await expect(seats.locator('.hover-select-current')).toContainText('6 seats');
});

test('every explanation sheet can be turned to', async ({ page }) => {
  const stack = variantsStack(page);
  await stack.scrollIntoViewIfNeeded();
  await expect.poll(() => frontPageName(stack)).toBe('Space Builder · Object Variants');

  for (const name of ['Variant Groups', 'Group Picker', 'Model Swap', 'Missing Variants']) {
    await swipeToPage(page, stack, name);
    expect(await frontPageName(stack)).toBe(name);
  }
});
