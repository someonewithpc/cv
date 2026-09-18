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

test('clicking an object then the floor keeps placing more of it', async ({ page }) => {
  const app = await openDemo(page);
  const chair = app.locator('[data-demo-target="catalog:chair"]');
  const canvas = app.locator('canvas[data-scene-canvas]');

  await chair.click();
  await expect(app).toHaveAttribute('data-phase', 'armed');
  await expect(app.locator('.hint')).toContainText('on the pointer');

  const box = await canvas.boundingBox();
  if (!box) throw new Error('Scene canvas has no layout box');

  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.5);
  await expect(app.getByText('Chair placed')).toBeVisible();

  // The object stays on the pointer, which is what makes the second click place a second
  // chair without going back to the catalog.
  await expect(app).toHaveAttribute('data-phase', 'armed');
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.45);
  await expect(app.getByText('Chair placed')).toBeVisible();

  await app.press('Escape');
  await expect(app).toHaveAttribute('data-phase', 'idle');
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

  await expect(app.getByText('Chair placed')).toBeVisible();
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
