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

for (const { name, viewport } of [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'phone', viewport: { width: 390, height: 844 } },
]) {
  test.describe(`transport deck at ${name} width`, () => {
    test.use({ viewport });

    test('is stamped in the border band, clear of the drawing', async ({ page }) => {
      const stack = spaceBuilderStack(page);
      await stack.evaluate((el) => el.scrollIntoView({ block: 'center' }));
      const front = frontPage(stack, await frontPageIndex(stack));
      await waitForSceneReady(front);

      const deck = front.locator('[data-demo-transport]');
      await expect(deck).toHaveAttribute('data-state', 'playing', { timeout: 20_000 });

      const placement = await deck.evaluate((el) => {
        const section = el.closest('section')!;
        const sheet = section.getBoundingClientRect();
        const box = el.getBoundingClientRect();
        const band = parseFloat(getComputedStyle(section).paddingBottom);
        const clearOf = (other: Element | null) => {
          if (!other) return false;
          const b = other.getBoundingClientRect();
          return box.right <= b.left + 1 || box.left >= b.right - 1
            || box.bottom <= b.top + 1 || box.top >= b.bottom - 1;
        };
        return {
          insideBand: box.top >= sheet.bottom - band - 1 && box.bottom <= sheet.bottom + 1,
          clearOfDrawing: clearOf(section.querySelector('.content')),
          clearOfTitleBlock: clearOf(section.querySelector('table')),
        };
      });
      // A phone sheet has no room in the band, so the deck takes a row of its own inside
      // the frame above the title block instead.
      expect(placement).toEqual({
        insideBand: name === 'desktop',
        clearOfDrawing: true,
        clearOfTitleBlock: true,
      });
    });
  });
}
