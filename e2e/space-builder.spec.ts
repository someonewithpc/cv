import { expect, test } from '@playwright/test';

import {
  armDrawCounter,
  frontPage,
  frontPageIndex,
  sceneDraws,
  swipeToPage,
  waitForIslandMounted,
} from './support/paperStack';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

function spaceBuilderStack(page: import('@playwright/test').Page) {
  return page.locator('article.technical-drawing-stack').nth(2);
}

/** Every scene app marks its own root `data-ready="true"` once Three.js has finished loading. */
async function waitForSceneReady(front: import('@playwright/test').Locator) {
  const island = await waitForIslandMounted(front);
  const app = island.locator('[data-ready]');
  await expect(app).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
  return app;
}

test('main page: scene loads and the add-object tool opens the catalog', async ({ page }) => {
  const stack = spaceBuilderStack(page);
  await stack.scrollIntoViewIfNeeded();
  const front = frontPage(stack, await frontPageIndex(stack));

  const app = await waitForSceneReady(front);
  await expect(app.locator('canvas[data-scene-canvas]')).toBeVisible();

  // Focusing the root is how a real visitor takes the demo over from its auto-play loop
  // (MockSceneApp.vue's `@focus="yieldToUser"`) — the "Add object" button itself just
  // toggles the catalog panel, so normalize to closed first rather than assume autoplay
  // left it there.
  await app.focus();
  const addObject = app.getByRole('button', { name: 'Add object' });
  if ((await app.getAttribute('data-panel')) !== 'closed') {
    await addObject.click();
    await expect(app).toHaveAttribute('data-panel', 'closed');
  }

  await addObject.click();
  await expect(app).toHaveAttribute('data-panel', 'catalog');
});

test('place page: select-area scene loads', async ({ page }) => {
  const stack = spaceBuilderStack(page);
  await stack.scrollIntoViewIfNeeded();
  await swipeToPage(page, stack, 'Place Area');
  const front = frontPage(stack, await frontPageIndex(stack));

  const app = await waitForSceneReady(front);
  await expect(app.locator('canvas[data-scene-canvas]')).toBeVisible();
});

test('parameters page: editing seat count updates the field', async ({ page }) => {
  const stack = spaceBuilderStack(page);
  await stack.scrollIntoViewIfNeeded();
  await swipeToPage(page, stack, 'Edit Parameters');
  const front = frontPage(stack, await frontPageIndex(stack));

  const app = await waitForSceneReady(front);
  const seats = app.locator('[data-demo-target="param:seats"]');

  // Focusing the sidebar is how a real visitor takes the demo over from its auto-play loop
  // (see ParametersSceneApp.vue's yieldToUser) — without it, autoplay keeps rewriting the field.
  await seats.click();
  await seats.fill('24');
  await seats.blur();

  await expect(seats).toHaveValue('24');
  await expect(app.locator('.invalid-feedback')).toHaveCount(0);
});

test('layouts page: picking a different layout style selects it', async ({ page }) => {
  const stack = spaceBuilderStack(page);
  await stack.scrollIntoViewIfNeeded();
  await swipeToPage(page, stack, 'Layout Styles');
  const front = frontPage(stack, await frontPageIndex(stack));

  const app = await waitForSceneReady(front);
  // LayoutsSceneApp.vue has its own inline sidebar (.style-chip buttons), distinct from
  // the data-demo-target-tagged OptionsPanel.vue the other scene pages share.
  const circle = app.getByRole('button', { name: 'Circle', exact: true });
  await circle.click();
  await expect(circle).toHaveClass(/active/);
});

test('layouts page: the scene draws and autoplay cycles the styles after the page turn', async ({ page }) => {
  await armDrawCounter(page);
  const stack = spaceBuilderStack(page);
  await stack.scrollIntoViewIfNeeded();
  await swipeToPage(page, stack, 'Layout Styles');
  const front = frontPage(stack, await frontPageIndex(stack));

  const app = await waitForSceneReady(front);

  // A mounted, ready scene on a page that never became the front one draws nothing: the
  // pages of a stack share one grid cell, and only one of them owns the WebGL context.
  const drawnOnArrival = await sceneDraws(app);
  await expect.poll(() => sceneDraws(app), { timeout: 20_000 }).toBeGreaterThan(drawnOnArrival);

  const activeStyle = () => app.locator('.style-chip.active .style-label').textContent();
  const styleOnArrival = await activeStyle();
  await expect.poll(activeStyle, { timeout: 20_000 }).not.toBe(styleOnArrival);
});

test('badge page: capacity-badge scene loads', async ({ page }) => {
  const stack = spaceBuilderStack(page);
  await stack.scrollIntoViewIfNeeded();
  await swipeToPage(page, stack, 'Capacity Badge');
  const front = frontPage(stack, await frontPageIndex(stack));

  const app = await waitForSceneReady(front);
  await expect(app.locator('canvas[data-scene-canvas]')).toBeVisible();
});

test('drag & drop page: catalog has a draggable chair', async ({ page }) => {
  const stack = spaceBuilderStack(page);
  await stack.scrollIntoViewIfNeeded();
  await swipeToPage(page, stack, 'Drag & Drop');
  const front = frontPage(stack, await frontPageIndex(stack));

  const app = await waitForSceneReady(front);
  // This page implements its own pointer-driven drag onto the 3D scene rather than native
  // HTML5 drag (DnDSceneApp.vue passes CatalogPanel `:native-drag="false"`), so the chair
  // item is deliberately not `draggable`.
  const chair = app.locator('[data-demo-target="catalog:chair"]');
  await expect(chair).toBeVisible();
  await expect(chair).toHaveAttribute('draggable', 'false');
});

test('drag & drop page: dragging the chair onto the ground places it in a live scene', async ({ page }) => {
  await armDrawCounter(page);
  const stack = spaceBuilderStack(page);
  await stack.scrollIntoViewIfNeeded();
  await swipeToPage(page, stack, 'Drag & Drop');
  const front = frontPage(stack, await frontPageIndex(stack));

  const app = await waitForSceneReady(front);
  const chair = app.locator('[data-demo-target="catalog:chair"]');
  const canvas = app.locator('canvas[data-scene-canvas]');
  const from = await chair.boundingBox();
  const to = await canvas.boundingBox();
  if (!from || !to) throw new Error('Catalog item or scene canvas has no layout box');

  // A real pointer sequence with intermediate moves: this page runs its own pointer drag
  // rather than native HTML5 drag, so `dragTo`'s drag events would never reach it.
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

  // The chair used to land in a scene whose renderer had been handed to the page behind
  // this one, so the drop was real but nothing was ever drawn.
  const drawnOnDrop = await sceneDraws(app);
  await expect.poll(() => sceneDraws(app), { timeout: 20_000 }).toBeGreaterThan(drawnOnDrop);
});

/** The walkthrough cursor relative to the canvas rect, with whether the "Chair placed" toast is up. */
function cursorAtDrop(app: import('@playwright/test').Locator) {
  return app.evaluate((root) => {
    const canvas = root.querySelector('canvas[data-scene-canvas]')?.getBoundingClientRect();
    const rect = root.querySelector('[data-demo-cursor]')?.getBoundingClientRect();
    const toast = Array.from(root.querySelectorAll('.toast')).some((el) =>
      el.textContent?.includes('Chair placed'),
    );
    if (!canvas || !rect) return { toast, x: NaN, y: NaN, width: NaN, height: NaN };
    return {
      toast,
      x: rect.left + rect.width / 2 - canvas.left,
      y: rect.top + rect.height / 2 - canvas.top,
      width: canvas.width,
      height: canvas.height,
    };
  });
}

/** Resolves with the cursor's position the first time the walkthrough reports a placed chair. */
async function nextDrop(app: import('@playwright/test').Locator) {
  let seen = { toast: false, x: NaN, y: NaN, width: NaN, height: NaN };
  await expect
    .poll(
      async () => {
        seen = await cursorAtDrop(app);
        return seen.toast;
      },
      { timeout: 25_000, intervals: [40] },
    )
    .toBe(true);
  return seen;
}

async function openDragAndDrop(page: import('@playwright/test').Page) {
  const stack = spaceBuilderStack(page);
  await stack.scrollIntoViewIfNeeded();
  await swipeToPage(page, stack, 'Drag & Drop');
  const front = frontPage(stack, await frontPageIndex(stack));
  const app = await waitForSceneReady(front);
  const canvas = app.locator('canvas[data-scene-canvas]');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Scene canvas has no layout box');
  return { app, box };
}

type Box = { x: number; y: number; width: number; height: number };

/** Orbit with a horizontal drag of `dx` px across the canvas (0.005 rad per px). */
async function orbitCamera(page: import('@playwright/test').Page, box: Box, dx: number) {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let step = 1; step <= 8; step += 1) {
    await page.mouse.move(cx + (dx * step) / 8, cy);
    await page.waitForTimeout(30);
  }
  await page.mouse.up();
}

/** Orbit with a drag, zoom in with the wheel and pan with a shift-drag, all on the canvas. */
async function moveCamera(page: import('@playwright/test').Page, box: Box) {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await orbitCamera(page, box, 160);
  await page.waitForTimeout(100);
  // Back over the canvas, whose wheel handler zooms instead of scrolling the page.
  await page.mouse.move(cx, cy);
  await page.mouse.wheel(0, -900);
  await page.waitForTimeout(100);
  await page.keyboard.down('Shift');
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let step = 1; step <= 6; step += 1) {
    await page.mouse.move(cx - step * 15, cy + step * 12);
    await page.waitForTimeout(30);
  }
  await page.mouse.up();
  await page.keyboard.up('Shift');
}

test('drag & drop page: the walkthrough still drops on the visible floor after the camera moves', async ({ page }) => {
  const { app, box } = await openDragAndDrop(page);
  const toast = app.getByText('Chair placed');
  const fresh = await nextDrop(app);

  // Once the toast is gone the lap's own 0.4 rad orbit has finished, so the view is home plus
  // that drift plus this drag. Taking over restarts the lap, so the next drop is the first
  // point again, the same one the fresh load dropped.
  await expect(toast).toBeHidden();
  await orbitCamera(page, box, -160);
  const orbited = await nextDrop(app);
  expect(orbited.x).toBeGreaterThan(0);
  expect(orbited.x).toBeLessThan(orbited.width);
  expect(orbited.y).toBeGreaterThan(0);
  expect(orbited.y).toBeLessThan(orbited.height);
  // The floor point moved on screen with the orbit. Drops used to be screen fractions, which
  // land on the same pixel whatever the camera does and so on some other floor spot.
  expect(Math.abs(orbited.x - fresh.x)).toBeGreaterThan(20);

  // Zooming in and panning may push the point out of view; the drop must still land in frame.
  await expect(toast).toBeHidden();
  await moveCamera(page, box);
  const moved = await nextDrop(app);
  expect(moved.x).toBeGreaterThan(0);
  expect(moved.x).toBeLessThan(moved.width);
  expect(moved.y).toBeGreaterThan(0);
  expect(moved.y).toBeLessThan(moved.height);
});

test('drag & drop page: Restart brings the camera home', async ({ page }) => {
  const { app, box } = await openDragAndDrop(page);
  const fresh = await nextDrop(app);

  await moveCamera(page, box);
  await expect(app.getByText('Chair placed')).toBeHidden();
  await app.getByRole('button', { name: 'Restart' }).click();

  // The first drop after Restart aims at the same floor point as the first drop after load,
  // so with the camera back home it lands on the same pixel; a kept view would put it elsewhere.
  const restarted = await nextDrop(app);
  expect(Math.abs(restarted.x - fresh.x)).toBeLessThan(8);
  expect(Math.abs(restarted.y - fresh.y)).toBeLessThan(8);
});
