import type { Locator, Page } from '@playwright/test';

import { demoStack, frontPage, frontPageIndex, waitForIslandMounted } from './support/paperStack';
import { expect, test } from './support/timeScale';

/** Real, loadable catalog objects; everything else in the catalog is a placeholder SVG. */
const REAL_ITEMS = ['chair', 'armchair', 'table-round'];

function spaceBuilderStack(page: Page) {
  return demoStack(page, 'Space Builder add tool');
}

async function waitForSceneReady(front: Locator): Promise<Locator> {
  const island = await waitForIslandMounted(front);
  const app = island.locator('[data-ready]');
  await expect(app).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
  return app;
}

async function openCatalog(page: Page): Promise<Locator> {
  const stack = spaceBuilderStack(page);
  await stack.scrollIntoViewIfNeeded();
  const app = await waitForSceneReady(frontPage(stack, await frontPageIndex(stack)));

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
    await expect(app.locator(`[data-catalog-item="${id}"]`)).not.toHaveClass(/placeholder/);
    // Real items show a render of their own GLB; placeholders keep the flat SVG icon. A
    // card with several finishes carries one picture per finish, so check the first.
    await expect(item.locator('img').first()).toHaveAttribute('src', /\.webp$/);
  }

  await expect(app.locator('[data-demo-target="catalog:barstool"]')).toHaveAttribute('draggable', 'false');
  await expect(app.locator('[data-catalog-item="barstool"]')).toHaveClass(/placeholder/);
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
  expect(models).not.toContain('banquet-8pax-243x121.glb');

  await app.locator('[data-demo-target="catalog:table-round"]').click();
  await expect.poll(() => models, { timeout: 20_000 }).toContain('banquet-8pax-243x121.glb');
  expect(models).not.toContain('armchair.glb');
});

/** Clicks where one of the carousel's arrows sits; they are the scroller's own buttons. */
async function clickArrow(page: Page, styles: Locator, side: 'previous' | 'next') {
  const box = await styles.boundingBox();
  if (!box) throw new Error('The carousel has no layout box');
  const x = side === 'next' ? box.x + box.width - 14 : box.x + 14;
  await page.mouse.click(x, box.y + box.height / 2);
}

test('the chair card steps through the library finishes', { tag: '@handover' }, async ({ page }) => {
  await page.goto('/');
  const app = await openCatalog(page);

  const card = app.locator('[data-catalog-item="chair"]');
  const styles = card.locator('ul.styles');

  await expect(card.locator('li.style')).toHaveCount(5);
  await expect(card.locator('.group-object-count').first()).toContainText('5');
  await expect(card).toHaveAttribute('data-variant', 'chair');

  // Four steps right lands on the last finish, and the carousel refuses to go further.
  for (let i = 0; i < 4; i += 1) {
    await clickArrow(page, styles, 'next');
    await page.waitForTimeout(500);
  }
  await expect(card).toHaveAttribute('data-variant', 'chair-black');
  await clickArrow(page, styles, 'next');
  await page.waitForTimeout(500);
  await expect(card).toHaveAttribute('data-variant', 'chair-black');

  await clickArrow(page, styles, 'previous');
  await expect(card).toHaveAttribute('data-variant', 'chair-white');
});

test('the banquet card swaps the model for the seat count and table size picked', async ({ page }) => {
  const models: string[] = [];
  page.on('request', (request) => {
    const file = request.url().split('/').pop() ?? '';
    if (file.endsWith('.glb')) models.push(file);
  });

  await page.goto('/');
  const app = await openCatalog(page);

  const card = app.locator('[data-catalog-item="table-round"]');
  const seats = card.locator('.hover-select').first();
  const size = card.locator('.hover-select').nth(1);

  await seats.locator('.hover-select-current').click();
  await expect(seats.locator('.hover-select-options button')).toHaveText([
    '8 seats', '6 seats', '4 seats',
  ]);
  await seats.locator('.hover-select-options li').nth(1).locator('button').click();
  await expect(card.locator('.object-icons img')).toHaveAttribute('src', /table-6-thumb\.webp$/);
  await expect.poll(() => models, { timeout: 20_000 }).toContain('banquet-6pax-243x121.glb');

  // 1.82m x 76cm tops out at six seats, so the other two read as unavailable.
  await size.locator('.hover-select-current').click();
  await size.locator('.hover-select-options li').nth(1).locator('button').click();
  await seats.locator('.hover-select-current').click();
  await expect(seats.locator('.hover-select-options li.unavailable button')).toHaveText([
    '8 seats', '4 seats',
  ]);
});

test.describe(() => {
  test.use({ walkthroughRate: 4 });

  test('the walkthrough runs a banquet loop of its own', async ({ page }) => {
    // The banquet preset is second, so a full grid build has to play out first.
    test.setTimeout(90_000);
    await page.goto('/');
    const stack = spaceBuilderStack(page);
    await stack.scrollIntoViewIfNeeded();
    const app = await waitForSceneReady(frontPage(stack, await frontPageIndex(stack)));

    // The banquet set is the only object this page fetches on its own, so the request is
    // the walkthrough reaching that preset.
    await page.waitForFunction(
      () => performance
        .getEntriesByType('resource')
        .some((entry) => entry.name.includes('banquet-8pax-243x121.glb')),
      undefined,
      { timeout: 60_000 },
    );
    await expect(app.locator('[data-catalog-item="table-round"]')).toHaveClass(/active/, { timeout: 30_000 });
  });
});
