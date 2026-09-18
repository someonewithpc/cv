import { expect, test, type Locator, type Page } from '@playwright/test';

import { frontPage, frontPageIndex, waitForIslandMounted } from './support/paperStack';

/** Real, loadable catalog objects; everything else in the catalog is a placeholder SVG. */
const REAL_ITEMS = ['chair', 'armchair', 'table-round'];

function spaceBuilderStack(page: Page) {
  return page.locator('article.technical-drawing-stack').nth(2);
}

async function openCatalog(page: Page): Promise<Locator> {
  const stack = spaceBuilderStack(page);
  await stack.scrollIntoViewIfNeeded();
  const front = frontPage(stack, await frontPageIndex(stack));
  const island = await waitForIslandMounted(front);
  const app = island.locator('[data-ready]');
  await expect(app).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });

  // Focusing the root takes the demo over from its auto-play loop (MockSceneApp.vue's
  // `@focus="yieldToUser"`), which otherwise keeps toggling the panel underneath us.
  await app.focus();
  const addObject = app.getByRole('button', { name: 'Add object' });
  if ((await app.getAttribute('data-panel')) !== 'catalog') {
    await addObject.click();
  }
  await expect(app).toHaveAttribute('data-panel', 'catalog');
  return app;
}

test('the catalog offers the chair, side chair and banquet table as real objects', async ({ page }) => {
  await page.goto('/');
  const app = await openCatalog(page);

  for (const id of REAL_ITEMS) {
    const item = app.locator(`[data-demo-target="catalog:${id}"]`);
    await expect(item).toHaveAttribute('draggable', 'true');
    await expect(item).not.toHaveClass(/placeholder/);
    // Real items show a render of their own GLB; placeholders keep the flat SVG icon.
    await expect(item.locator('img')).toHaveAttribute('src', /\.webp$/);
  }

  const barstool = app.locator('[data-demo-target="catalog:barstool"]');
  await expect(barstool).toHaveAttribute('draggable', 'false');
  await expect(barstool).toHaveClass(/placeholder/);
});

test('a catalog model is only fetched once its item is picked', async ({ page }) => {
  const models: string[] = [];
  page.on('request', (request) => {
    const file = request.url().split('/').pop() ?? '';
    if (file.endsWith('.glb')) models.push(file);
  });

  await page.goto('/');
  const app = await openCatalog(page);

  // The chair is the scene's own model and is warmed on boot; the heavier extras must
  // stay off the wire until a visitor asks for one.
  expect(models).toContain('chair.glb');
  expect(models).not.toContain('banquet-table.glb');

  await app.locator('[data-demo-target="catalog:table-round"]').click();
  await expect.poll(() => models, { timeout: 20_000 }).toContain('banquet-table.glb');
  expect(models).not.toContain('armchair.glb');
});
