import { expect, test } from '@playwright/test';

import { frontPage, frontPageIndex, swipeToPage, waitForIslandMounted } from './support/paperStack';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

function markerEditorStack(page: import('@playwright/test').Page) {
  return page.locator('article.technical-drawing-stack').nth(1);
}

test('main page: map pins mount and clicking one opens the marker picker', async ({ page }) => {
  const stack = markerEditorStack(page);
  await stack.scrollIntoViewIfNeeded();
  const front = frontPage(stack, await frontPageIndex(stack));

  const island = await waitForIslandMounted(front);
  const overlay = island.locator('.mock-map-overlay');
  const pins = overlay.locator('button.space-pin');
  await expect(pins.first()).toBeVisible({ timeout: 15_000 });
  expect(await pins.count()).toBeGreaterThan(0);

  // Pins only respond once a real pointer has taken over from the auto-playing demo
  // (MockMapApp.tsx's onFocus/pointermove -> yieldToUser -> setUserControl(true)).
  // DOM focus lands synchronously, but React's re-render with the new `interactive` prop
  // doesn't — wait for the toast that confirms the handoff actually landed before clicking.
  await overlay.focus();
  await expect(page.getByText('Demo paused')).toBeVisible();
  await pins.first().click();

  const picker = page.getByRole('listbox', { name: 'Markers' });
  await expect(picker).toBeVisible();
  expect(await picker.getByRole('option').count()).toBeGreaterThan(0);

  await page.getByRole('option', { name: 'Close marker selector' }).click();
  await expect(picker).not.toBeVisible();
});

test('selector page: static marker-picker illustration is reachable', async ({ page }) => {
  const stack = markerEditorStack(page);
  await stack.scrollIntoViewIfNeeded();
  await swipeToPage(page, stack, 'Marker Selector');
  const front = frontPage(stack, await frontPageIndex(stack));
  await expect(front.locator('section')).toBeVisible();
});

test('editor page: live marker-editor diagram mounts', async ({ page }) => {
  const stack = markerEditorStack(page);
  await stack.scrollIntoViewIfNeeded();
  await swipeToPage(page, stack, 'Marker Editor');
  const front = frontPage(stack, await frontPageIndex(stack));

  await waitForIslandMounted(front);
  // The embed only renders once the page reports itself visible to its own internal
  // observer and no other live marker-editor session is open — both true here, a fresh
  // isolated test starting straight on this page.
  await expect(front.locator('.marker-editor--embed')).toBeVisible({ timeout: 15_000 });
});

test('background page: static preview-background illustration is reachable', async ({ page }) => {
  const stack = markerEditorStack(page);
  await stack.scrollIntoViewIfNeeded();
  await swipeToPage(page, stack, 'Preview Background');
  const front = frontPage(stack, await frontPageIndex(stack));
  await expect(front.locator('section')).toBeVisible();
});

test('parts page: static composable-parts illustration is reachable', async ({ page }) => {
  const stack = markerEditorStack(page);
  await stack.scrollIntoViewIfNeeded();
  await swipeToPage(page, stack, 'Composable Parts');
  const front = frontPage(stack, await frontPageIndex(stack));
  await expect(front.locator('section')).toBeVisible();
});

test('store page: static undoable-store illustration is reachable', async ({ page }) => {
  const stack = markerEditorStack(page);
  await stack.scrollIntoViewIfNeeded();
  await swipeToPage(page, stack, 'Undoable Store');
  const front = frontPage(stack, await frontPageIndex(stack));
  await expect(front.locator('section')).toBeVisible();
});

test('parts and store pages: the diagram fills the sheet it sits on', async ({ page }) => {
  const stack = markerEditorStack(page);
  await stack.scrollIntoViewIfNeeded();

  for (const name of ['Composable Parts', 'Undoable Store']) {
    await swipeToPage(page, stack, name);
    const front = frontPage(stack, await frontPageIndex(stack));
    const diagram = front.locator('section .content > *').first();
    await expect(diagram).toBeVisible();

    const fit = await diagram.evaluate((el) => {
      const sheet = el.closest('section')!.getBoundingClientRect();
      const cell = el.parentElement!.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      return {
        inside:
          box.left >= sheet.left - 1
          && box.right <= sheet.right + 1
          && box.top >= sheet.top - 1
          && box.bottom <= sheet.bottom + 1,
        widthShare: box.width / cell.width,
      };
    });

    // Both halves matter: these two diagrams used to stop around two thirds of the
    // artwork area while the pages either side filled theirs, and the type scale that
    // fixes that is the one thing that could push them off the sheet.
    expect(fit.inside).toBe(true);
    expect(fit.widthShare).toBeGreaterThan(0.8);
  }
});
