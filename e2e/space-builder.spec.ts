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
