import { expect, test, type Locator, type Page } from '@playwright/test';

import {
  armDrawCounter,
  frontPage,
  frontPageIndex,
  sceneDraws,
  swipeToPage,
  waitForIslandMounted,
} from './support/paperStack';

/** Last stack on the page, after the logo, marker editor and the other Space Builder sheets. */
function dragDropStack(page: Page) {
  return page.locator('article.technical-drawing-stack').nth(6);
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

test('the second sheet shows the handoff in four frames of the demo and few words', async ({ page }) => {
  const stack = dragDropStack(page);
  await stack.scrollIntoViewIfNeeded();
  await expect(stack.locator(':scope > div')).toHaveCount(2);

  await swipeToPage(page, stack, 'Picture to Model', 2);
  const front = frontPage(stack, await frontPageIndex(stack));
  const layer = front.locator('[data-handoff-layer]');
  await expect(layer).toBeVisible();
  await expect(layer.locator('img[src^="/demos/drag-drop/handoff-"]')).toHaveCount(4);
  // The callouts' placement is annotations-position.spec.ts's; here only that they exist.
  await expect(layer.locator('svg[data-annotations] [data-target]')).toHaveCount(4);

  const words = await front.evaluate((page) => {
    const text = [
      page.querySelector<HTMLElement>('[data-handoff-layer]')?.innerText ?? '',
      page.querySelector<HTMLElement>('.aside')?.innerText ?? '',
    ].join(' ');
    return text.split(/\s+/).filter((word) => /\w/.test(word)).length;
  });
  expect(words).toBeLessThan(30);
});

test('a grass texture that fails to load is retried once, then the flat colour stays', async ({ page }) => {
  const requests: string[] = [];
  await page.route('**/demos/space-builder/grass/color.webp*', (route) => {
    requests.push(route.request().url());
    void route.abort('failed');
  });
  const app = await openDemo(page);
  await expect(app).toHaveAttribute('data-ready', 'true');
  await expect.poll(() => requests.length, { timeout: 20_000 }).toBe(2);
  expect(requests[1]).toContain('?retry');
  // The scene keeps running on its built-in ground colour rather than failing over.
  await expect(app.locator('.boot-cover')).toHaveCount(0);
  await expect(app.locator('canvas[data-scene-canvas]')).toBeVisible();
});

test('a lost WebGL context shows the sheet fallback until the context is back', async ({ page }) => {
  const app = await openDemo(page);
  const canvas = app.locator('canvas[data-scene-canvas]');
  const cover = app.locator('.boot-cover.error');

  const lost = await canvas.evaluate((el) => {
    const gl = (el as HTMLCanvasElement).getContext('webgl2') ?? (el as HTMLCanvasElement).getContext('webgl');
    const ext = gl?.getExtension('WEBGL_lose_context');
    if (!ext) return false;
    ext.loseContext();
    setTimeout(() => ext.restoreContext(), 800);
    return true;
  });
  if (!lost) test.skip(true, 'WEBGL_lose_context unavailable');

  await expect(cover).toBeVisible();
  await expect(cover).toContainText('3D scene unavailable');
  await expect(cover).toBeHidden({ timeout: 10_000 });
});
