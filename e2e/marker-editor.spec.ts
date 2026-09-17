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

test('status chip: auto-playing until the visitor takes over, then Replay hands it back', async ({ page }) => {
  const stack = markerEditorStack(page);
  await stack.scrollIntoViewIfNeeded();
  const front = frontPage(stack, await frontPageIndex(stack));
  await waitForIslandMounted(front);

  const chip = front.locator('[data-demo-status]');
  const replay = chip.locator('[data-demo-status-replay]');
  await expect(chip).toHaveAttribute('data-state', 'playing', { timeout: 15_000 });
  await expect(chip).toContainText('Auto-playing');
  await expect(replay).toBeHidden();

  await front.locator('.mock-map-overlay').focus();
  await expect(chip).toHaveAttribute('data-state', 'user');
  await expect(chip).toContainText("You're in control");
  await expect(replay).toBeVisible();

  // Focus is a deliberate takeover, so the idle resume (2s) must not fire.
  await page.waitForTimeout(3000);
  await expect(chip).toHaveAttribute('data-state', 'user');

  await replay.click();
  await expect(chip).toHaveAttribute('data-state', 'playing');
});
