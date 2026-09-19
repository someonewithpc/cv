import { expect, test, type Locator, type Page } from '@playwright/test';

import {
  armDrawCounter,
  frontPage,
  frontPageIndex,
  sceneDraws,
  swipeToPage,
  waitForIslandMounted,
} from './support/paperStack';

/** Fourth stack on the page: logo, marker editor, Space Builder, then this one. */
function dragDropStack(page: Page) {
  return page.locator('article.technical-drawing-stack').nth(3);
}

/** The scene app marks its own root `data-ready="true"` once Three.js has finished loading. */
async function openDemo(page: Page): Promise<Locator> {
  const stack = dragDropStack(page);
  await stack.scrollIntoViewIfNeeded();
  const front = frontPage(stack, await frontPageIndex(stack));
  const island = await waitForIslandMounted(front);
  const app = island.locator('[data-ready]');
  await expect(app).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
  return app;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('the scene loads with the catalog beside it', async ({ page }) => {
  const app = await openDemo(page);
  await expect(app.locator('canvas[data-scene-canvas]')).toBeVisible();
  await expect(app.getByRole('heading', { name: 'Select an Object' })).toBeVisible();

  // This page runs its own pointer drag rather than native HTML5 drag, so the chair
  // item is deliberately not `draggable`.
  const chair = app.locator('[data-demo-target="catalog:chair"]');
  await expect(chair).toBeVisible();
  await expect(chair).toHaveAttribute('draggable', 'false');
});

test('a single click only highlights a card', async ({ page }) => {
  const app = await openDemo(page);
  await app.locator('[data-demo-target="catalog:table-round"]').click();
  await expect(app).toHaveAttribute('data-phase', 'idle');
});

test('double-clicking an object places one on the next floor click, then goes back to view', async ({ page }) => {
  const app = await openDemo(page);
  const table = app.locator('[data-demo-target="catalog:table-round"]');
  const canvas = app.locator('canvas[data-scene-canvas]');

  await table.dblclick();
  await expect(app).toHaveAttribute('data-phase', 'armed');

  const box = await canvas.boundingBox();
  if (!box) throw new Error('Scene canvas has no layout box');

  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.5);
  // `Single.end()` selects what it placed, so the floor shows the product's green highlight.
  await expect(app).toHaveAttribute('data-selected', 'true');

  // Space Builder's Single subaction commits the object and sets the editor back to `view`.
  // Nothing rides the pointer afterwards, so a second click cannot place a second object.
  await expect(app).toHaveAttribute('data-phase', 'idle');
});

test('Esc drops an armed object instead of placing it', async ({ page }) => {
  const app = await openDemo(page);
  await app.locator('[data-demo-target="catalog:table-round"]').dblclick();
  await expect(app).toHaveAttribute('data-phase', 'armed');
  await app.press('Escape');
  await expect(app).toHaveAttribute('data-phase', 'idle');
});

test('the style picked on a card is the model that gets loaded', async ({ page }) => {
  const glbs: string[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('.glb')) glbs.push(request.url());
  });

  const app = await openDemo(page);
  const card = app.locator('[data-catalog-item="table-round"]');

  // Six seats on the wide top is its own GLB, not the default eight.
  await card.locator('.object-pax .hover-select-current').click();
  await card.locator('.object-pax .hover-select-options button', { hasText: '6 seats' }).click();

  await card.locator('[data-demo-target="catalog:table-round"]').dblclick();
  // Only a picked style gets this file; the card's default is the eight-seat top.
  await expect
    .poll(() => glbs.some((url) => url.includes('banquet-6pax-243x121')), { timeout: 20_000 })
    .toBe(true);
});

test('dragging an object onto the floor places exactly one in a live scene', async ({ page }) => {
  await armDrawCounter(page);
  const app = await openDemo(page);
  const chair = app.locator('[data-demo-target="catalog:chair"]');
  const canvas = app.locator('canvas[data-scene-canvas]');
  const from = await chair.boundingBox();
  const to = await canvas.boundingBox();
  if (!from || !to) throw new Error('Catalog item or scene canvas has no layout box');

  // A real pointer sequence with intermediate moves: this page runs its own pointer drag,
  // so `dragTo`'s drag events would never reach it.
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const drop = { x: to.x + to.width * 0.45, y: to.y + to.height * 0.55 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let step = 1; step <= 10; step += 1) {
    await page.mouse.move(
      start.x + ((drop.x - start.x) * step) / 10,
      start.y + ((drop.y - start.y) * step) / 10,
    );
    await page.waitForTimeout(40);
  }
  await page.mouse.up();

  await expect(app).toHaveAttribute('data-selected', 'true');
  // A drop ends the drag, unlike a click, which leaves the object on the pointer.
  await expect(app).toHaveAttribute('data-phase', 'idle');

  // The chair has to land in the scene that owns the WebGL context, or the drop is real
  // but nothing is ever drawn.
  const drawnOnDrop = await sceneDraws(app);
  await expect.poll(() => sceneDraws(app), { timeout: 20_000 }).toBeGreaterThan(drawnOnDrop);
});

test('autoplay runs and hands over to the visitor', async ({ page }) => {
  const app = await openDemo(page);
  const playing = app.locator('.demo-flash');
  await expect(playing).toBeVisible({ timeout: 25_000 });

  await app.locator('[data-demo-target="catalog:chair"]').click();
  await expect(playing).toBeHidden();
});

test('the explanation sheets turn into view', async ({ page }) => {
  const stack = dragDropStack(page);
  await stack.scrollIntoViewIfNeeded();

  await swipeToPage(page, stack, 'Two Ways In', 3);
  let front = frontPage(stack, await frontPageIndex(stack));
  await expect(front.locator('.paths-layer')).toBeVisible();
  await expect(front.getByText('placeGhostAsSingle()')).toBeVisible();

  await swipeToPage(page, stack, 'Drop Before Load', 3);
  front = frontPage(stack, await frontPageIndex(stack));
  await expect(front.locator('.race-layer')).toBeVisible();
  await expect(front.getByText('Drop arrives first')).toBeVisible();
});
