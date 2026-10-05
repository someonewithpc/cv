import type { Locator, Page } from '@playwright/test';

import { demoStack, frontPage, frontPageIndex, waitForIslandMounted } from './support/paperStack';
import { expect, test } from './support/timeScale';

/** The front page of a demo stack, scrolled to, with its island mounted. */
async function front(page: Page, title: string) {
  const stack = demoStack(page, title);
  await stack.scrollIntoViewIfNeeded();
  const sheetFront = frontPage(stack, await frontPageIndex(stack));
  await waitForIslandMounted(sheetFront);
  return sheetFront;
}

async function sceneApp(page: Page, title: string) {
  const app = (await front(page, title)).locator('[data-ready]');
  await expect(app).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
  return app;
}

const translate = (handle: Locator) => handle.evaluate((el) => (el as SVGGElement).style.translate);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('Variants: Enter picks the banquet set and Space picks the chair carousel', async ({ page }) => {
  const app = (await front(page, 'Space Builder · Object Variants')).locator('.variants-stage');
  await expect(app).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  await app.focus();

  const set = app.locator('[data-catalog-item="table-round"]');
  await set.locator('button.object-icons').focus();
  await page.keyboard.press('Enter');
  await expect(set).toHaveClass(/active/);

  const chair = app.locator('[data-catalog-item="chair"]');
  await chair.locator('ul.styles').focus();
  await page.keyboard.press(' ');
  await expect(chair).toHaveClass(/active/);
  await expect(set).not.toHaveClass(/active/);
});

test('Drag & Drop: Enter picks, Enter arms, the arrows walk the ghost and Enter places', async ({ page }) => {
  const app = await sceneApp(page, 'Space Builder · Drag & Drop');
  const table = app.locator('[data-demo-target="catalog:table-round"]');

  await table.focus();
  await page.keyboard.press('Enter');
  await expect(app).toHaveAttribute('data-phase', 'idle');
  await page.keyboard.press('Enter');
  await expect(app).toHaveAttribute('data-phase', 'armed', { timeout: 15_000 });

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(app).toHaveAttribute('data-selected', 'true');
  await expect(app).toHaveAttribute('data-phase', 'idle');
  await expect(app).not.toHaveAttribute('data-placed', '');
  await expect(table).toBeFocused();
});

test('Drag & Drop: Esc puts a keyboard-armed object back', async ({ page }) => {
  const app = await sceneApp(page, 'Space Builder · Drag & Drop');
  const table = app.locator('[data-demo-target="catalog:table-round"]');
  await table.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(app).toHaveAttribute('data-phase', 'armed', { timeout: 15_000 });
  await page.keyboard.press('Escape');
  await expect(app).toHaveAttribute('data-phase', 'idle');
  await expect(app).toHaveAttribute('data-placed', '');
});

test('Space Builder: the Side Chair goes down from the keyboard and focus returns to Add', async ({ page }) => {
  const app = await sceneApp(page, 'Space Builder · Add Tool');
  await app.focus();
  if ((await app.getAttribute('data-panel')) !== 'closed') {
    await page.keyboard.press('Escape');
    await expect(app).toHaveAttribute('data-panel', 'closed');
  }
  await page.keyboard.press('a');
  await expect(app).toHaveAttribute('data-panel', 'catalog');

  const sideChair = app.locator('[data-demo-target="catalog:armchair"]');
  await sideChair.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(app.locator('.toasts')).toContainText('Arrow keys move it');
  await page.keyboard.press('ArrowLeft');
  // Retried: the first Enter can beat the model's download, and then says so and waits.
  await expect(async () => {
    if ((await app.getAttribute('data-panel')) !== 'closed') await page.keyboard.press('Enter');
    await expect(app).toHaveAttribute('data-panel', 'closed', { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await expect(app.locator('.toasts')).toContainText('Object placed');
  await expect(app.getByRole('button', { name: 'Add object' })).toBeFocused();
});

test('marker editor: a handle moves on the arrows and each option list is one Tab stop', async ({ page }) => {
  // The live editor, opened from the map with the keyboard; the sheet's embed is a playback.
  const overlay = (await front(page, 'Interactive Map Marker Editor')).locator('.mock-map-overlay');
  const pin = overlay.locator('button.space-pin').first();
  await expect(pin).toBeVisible({ timeout: 15_000 });
  await pin.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('option', { name: 'Create new marker' }).focus();
  await page.keyboard.press('Enter');
  const editor = page.locator('#marker-editor');
  await expect(editor.getByRole('button', { name: 'Go back' })).toBeFocused();

  const handle = editor.locator('.control-point').first();
  await handle.focus();
  const before = await translate(handle);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => translate(handle)).not.toBe(before);

  const shapes = editor.locator('ul[aria-label="Shape"] > [role="option"]');
  await expect(shapes.and(editor.locator('[tabindex="0"]'))).toHaveCount(1);
  const selected = editor.locator('ul[aria-label="Shape"] > [aria-selected="true"]');
  const from = await selected.getAttribute('data-demo-target');
  await selected.focus();
  await page.keyboard.press('End');
  const last = shapes.last();
  await expect(last).toBeFocused();
  await expect(last).toHaveAttribute('aria-selected', 'true');
  await expect(last).toHaveAttribute('tabindex', '0');
  expect(await last.getAttribute('data-demo-target')).not.toBe(from);

  // Custom Icon's own choices: reachable, and the arrows choose.
  await editor.locator('summary[data-demo-target="editor:step:decoration"]').focus();
  await page.keyboard.press('Enter');
  await editor.locator('li[data-demo-target="editor:decoration:customIcon"]').focus();
  await page.keyboard.press('Enter');
  const icons = editor.locator('ul[aria-label="Decorations"] > [role="option"]:not([aria-disabled="true"])');
  await expect(icons.first()).toBeVisible({ timeout: 10_000 });
  const stop = editor.locator('ul[aria-label="Decorations"] > [tabindex="0"]');
  await expect(stop).toHaveCount(1);
  await stop.focus();
  await page.keyboard.press('Home');
  await expect(icons.first()).toHaveAttribute('aria-selected', 'true');
  // The demo stocks one icon; the arrows pass over the upload slot, which is not on offer.
  await page.keyboard.press('ArrowRight');
  await expect(icons.last()).toHaveAttribute('aria-selected', 'true');
  await expect(icons.last()).toBeFocused();
});

test('Synthetic Properties: a focused chip lights its pieces, and the arrows move along', async ({ page }) => {
  const sheet = await front(page, 'Synthetic Properties');
  const tool = sheet.locator('.synthetic-tool[data-live]');
  const chips = tool.locator('.chip');
  await expect(chips.first()).toHaveAttribute('tabindex', '0');

  await chips.first().focus();
  await expect(tool).toHaveAttribute('data-dim-hover', '0');
  await page.keyboard.press('ArrowRight');
  await expect(chips.nth(1)).toBeFocused();
  await expect(tool).toHaveAttribute('data-dim-hover', '1');

  const weight = (dim: number) => tool.locator(`.piece[data-dim="${dim}"]`).first()
    .evaluate((el) => getComputedStyle(el).fontWeight);
  await expect.poll(() => weight(1)).toBe('600');
  await expect.poll(() => weight(0)).toBe('400');

  await page.keyboard.press('Tab');
  await expect(tool).not.toHaveAttribute('data-dim-hover', /./);
});
