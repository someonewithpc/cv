import type { Locator, Page } from '@playwright/test';

import { demoStack, frontDeck, frontPage, frontPageIndex, waitForIslandMounted } from './support/paperStack';
import { expect, test } from './support/timeScale';

/**
 * Every test starts at the top of the page and reaches its demo the way a keyboard visitor
 * does: Tab presses only, no script focus, no clicks, with the walkthrough running. Round one
 * of this spec focused each control from a script and passed while the keys did nothing for a
 * visitor who Tabbed there.
 */

function isFocused(target: Locator) {
  return target.evaluateAll((els) => els.some((el) => el === document.activeElement && el.matches(':focus')));
}

/** The element Tab has landed on is `list`, but one of its scroll buttons or markers holds focus. */
function onCarouselStop(list: Locator) {
  return list.evaluateAll((els) => els.some((el) => el === document.activeElement && !el.matches(':focus')));
}

type Demo = { stack: Locator; deck: Locator };

/**
 * Tabs to the demo's stack, waits there as a reader would while its island boots and checks
 * the walkthrough is playing, then Tabs on until `target` holds focus.
 */
async function tabInto(page: Page, title: string, target: (front: Locator) => Locator, max = 400) {
  const stack = demoStack(page, title);
  let front: Locator | null = null;
  let deck: Locator | null = null;
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    if (!front && (await stack.evaluate((el) => el === document.activeElement))) {
      front = frontPage(stack, await frontPageIndex(stack));
      await waitForIslandMounted(front);
      deck = frontDeck(stack, front);
      await expect(deck).toHaveAttribute('data-state', 'playing', { timeout: 30_000 });
    }
    if (front && (await isFocused(target(front)))) return { stack, deck: deck!, front, target: target(front) };
  }
  throw new Error(`${max} Tab presses never reached the control in ${title}`);
}

/** Tab presses from the current focus until `target` holds it. */
async function tabTo(page: Page, target: Locator, max = 40) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    if (await isFocused(target)) return;
  }
  throw new Error(`${max} Tab presses never reached ${target}`);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('Space Builder catalog', () => {
  const title = 'Space Builder · Add Tool';

  async function openCatalog(page: Page): Promise<Demo & { app: Locator }> {
    const { stack, deck, front } = await tabInto(page, title, (f) => f.getByRole('button', { name: 'Add object' }));
    await expect(deck).toHaveAttribute('data-state', 'user');
    const app = front.locator('[data-ready]');
    await page.keyboard.press('Enter');
    await expect(app).toHaveAttribute('data-panel', 'catalog');
    return { stack, deck, app };
  }

  test('Tab to Side Chair, Enter twice, the arrows and Enter put it down', async ({ page }) => {
    const { app, deck } = await openCatalog(page);
    await tabTo(page, app.locator('[data-demo-target="catalog:armchair"]'));
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
    await expect(deck).toHaveAttribute('data-state', 'user');
  });

  test('Enter on the Chair list opens Build and keeps focus; Enter on its scroll buttons does not', async ({ page }) => {
    const { app } = await openCatalog(page);
    const chair = app.locator('ul.styles');
    // Tab passes the carousel's own scroll buttons and markers before the list itself.
    await tabTo(page, chair);
    await page.keyboard.press('Enter');
    await expect(app).toHaveAttribute('data-panel', 'options');
    await expect(app.getByTitle('Go back')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(app).toHaveAttribute('data-panel', 'catalog');
    await expect(app.getByTitle('Cancel')).toBeFocused();

    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    expect(await onCarouselStop(chair)).toBe(true);
    await page.keyboard.press('Enter');
    await expect(app).toHaveAttribute('data-panel', 'catalog');
  });
});

test.describe('Drag & Drop catalog', () => {
  const title = 'Space Builder · Drag & Drop';
  const table = (f: Locator) => f.locator('[data-demo-target="catalog:table-round"]');

  test('Tab to Banquet Table, Enter twice, the arrows walk the ghost and Enter places', async ({ page }) => {
    const { front, deck, target } = await tabInto(page, title, table);
    await expect(deck).toHaveAttribute('data-state', 'user');
    const app = front.locator('[data-ready]');
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
    await expect(target).toBeFocused();
  });

  test('Esc puts a keyboard-armed object back', async ({ page }) => {
    const { front } = await tabInto(page, title, table);
    const app = front.locator('[data-ready]');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(app).toHaveAttribute('data-phase', 'armed', { timeout: 15_000 });
    await page.keyboard.press('Escape');
    await expect(app).toHaveAttribute('data-phase', 'idle');
    await expect(app).toHaveAttribute('data-placed', '');
  });
});

test('Variants: the first carousel stop takes the cards over, then Enter and Space pick', async ({ page }) => {
  const stage = (f: Locator) => f.locator('.variants-stage');
  const chairList = (f: Locator) => stage(f).locator('[data-catalog-item="chair"] ul.styles');
  const stack = demoStack(page, 'Space Builder · Object Variants');
  let front: Locator | null = null;
  for (let i = 0; i < 400; i++) {
    await page.keyboard.press('Tab');
    if (!front && (await stack.evaluate((el) => el === document.activeElement))) {
      front = frontPage(stack, await frontPageIndex(stack));
      await waitForIslandMounted(front);
      await expect(frontDeck(stack, front)).toHaveAttribute('data-state', 'playing', { timeout: 30_000 });
    }
    if (front && (await onCarouselStop(chairList(front)))) break;
  }
  if (!front) throw new Error('Tab never reached the Object Variants sheet');
  await expect(frontDeck(stack, front)).toHaveAttribute('data-state', 'user');

  const chair = stage(front).locator('[data-catalog-item="chair"]');
  const set = stage(front).locator('[data-catalog-item="table-round"]');
  await tabTo(page, set.locator('button.object-icons'));
  await page.keyboard.press('Enter');
  await expect(set).toHaveClass(/active/);
  await expect(chair).not.toHaveClass(/active/);

  await page.keyboard.press('Shift+Tab');
  expect(await isFocused(chairList(front))).toBe(true);
  await page.keyboard.press(' ');
  await expect(chair).toHaveClass(/active/);
  await expect(set).not.toHaveClass(/active/);
  await expect(frontDeck(stack, front)).toHaveAttribute('data-state', 'user');
});

test('marker editor: Enter on a pin lands on its marker, and the editor takes the keys', async ({ page }) => {
  const translate = (handle: Locator) => handle.evaluate((el) => (el as SVGGElement).style.translate);
  const { deck } = await tabInto(page, 'Interactive Map Marker Editor', (f) => f.locator('button.space-pin').first());
  await expect(deck).toHaveAttribute('data-state', 'user');
  await page.keyboard.press('Enter');
  const current = page.getByRole('option', { name: 'Marker default' });
  await expect(current).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('option', { name: 'Create new marker' })).toBeFocused();
  await page.keyboard.press('Enter');
  const editor = page.locator('#marker-editor');
  await expect(editor.getByRole('button', { name: 'Go back' })).toBeFocused();

  const handle = editor.locator('.control-point').first();
  await tabTo(page, handle);
  const before = await translate(handle);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => translate(handle)).not.toBe(before);

  const shapes = editor.locator('ul[aria-label="Shape"] > [role="option"]');
  await tabTo(page, shapes);
  const from = await editor.locator('ul[aria-label="Shape"] > [aria-selected="true"]').getAttribute('data-demo-target');
  await page.keyboard.press('End');
  const last = shapes.last();
  await expect(last).toBeFocused();
  await expect(last).toHaveAttribute('aria-selected', 'true');
  expect(await last.getAttribute('data-demo-target')).not.toBe(from);
  await expect(deck).toHaveAttribute('data-state', 'user');
});

test('marker editor: closing the selector from the keyboard gives focus back to the pin', async ({ page }) => {
  const { target } = await tabInto(page, 'Interactive Map Marker Editor', (f) => f.locator('button.space-pin').first());
  const label = await target.getAttribute('aria-label');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('option', { name: 'Marker default' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: label! })).toBeFocused();
});

test('Synthetic Properties: Tab to the chips, a focused chip lights its pieces and the arrows move along', async ({ page }) => {
  const { front, deck, target } = await tabInto(page, 'Synthetic Properties', (f) => f.locator('.synthetic-tool[data-live] .chip'));
  await expect(deck).toHaveAttribute('data-state', 'user');
  const tool = front.locator('.synthetic-tool[data-live]');
  const chips = tool.locator('.chip');
  await expect(target.first()).toBeFocused();
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
