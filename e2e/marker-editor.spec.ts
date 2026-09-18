import { expect, test } from '@playwright/test';

import {
  frontPage,
  frontPageIndex,
  swipeStack,
  swipeToPage,
  waitForIslandMounted,
} from './support/paperStack';

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

const VIEWPORTS = [
  { name: 'desktop', viewport: { width: 1280, height: 720 } },
  { name: 'phone', viewport: { width: 390, height: 844 } },
];

for (const { name, viewport } of VIEWPORTS) {
  test.describe(`transport deck at ${name} width`, () => {
    test.use({ viewport });

    test('follows hover, the pause key and reset', async ({ page }) => {
      const stack = markerEditorStack(page);
      // Centred, not just nudged into view: the demo only drives itself (and so only
      // reports to the deck) while its page counts as active.
      await stack.evaluate((el) => el.scrollIntoView({ block: 'center' }));
      const front = frontPage(stack, await frontPageIndex(stack));
      await waitForIslandMounted(front);

      const deck = front.locator('[data-demo-transport]');
      const play = deck.locator('[data-demo-key="play"]');
      const pause = deck.locator('[data-demo-key="pause"]');
      const reset = deck.locator('[data-demo-key="reset"]');

      await expect(deck).toHaveAttribute('data-state', 'playing', { timeout: 20_000 });
      await expect(deck).toContainText('AUTO PLAYING');
      await expect(play).toHaveAttribute('aria-pressed', 'true');
      await expect(pause).toHaveAttribute('aria-pressed', 'false');

      // Hovering the sheet is the takeover the deck's hint promises.
      const box = (await stack.boundingBox())!;
      await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.6);
      await page.mouse.move(box.x + box.width * 0.42, box.y + box.height * 0.62);
      await expect(deck).toHaveAttribute('data-state', 'user');
      await expect(deck).toContainText('MANUAL CONTROL');
      await expect(pause).toHaveAttribute('aria-pressed', 'true');
      await expect(play).toHaveAttribute('aria-pressed', 'false');

      // Play hands the walkthrough back.
      await play.click();
      await expect(deck).toHaveAttribute('data-state', 'playing');

      // Pause is the explicit takeover, and it holds past the idle resume (2s).
      await pause.click();
      await expect(deck).toHaveAttribute('data-state', 'user');
      await page.waitForTimeout(3000);
      await expect(deck).toHaveAttribute('data-state', 'user');

      // Reset starts the walkthrough again.
      await reset.click();
      await expect(deck).toHaveAttribute('data-state', 'playing');
    });
  });
}

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the map walkthrough stays parked and the deck says so', async ({ page }) => {
    const stack = markerEditorStack(page);
    await stack.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    const front = frontPage(stack, await frontPageIndex(stack));
    await waitForIslandMounted(front);

    const deck = front.locator('[data-demo-transport]');
    await expect(deck).toHaveAttribute('data-state', 'off', { timeout: 20_000 });
    await expect(deck).toContainText('AUTO PLAY OFF');
    for (const key of ['reset', 'play', 'pause']) {
      await expect(deck.locator(`[data-demo-key="${key}"]`)).toBeDisabled();
    }

    // Nothing of the walkthrough runs: no drawn cursor, and it never opens the editor.
    await page.waitForTimeout(4000);
    await expect(front.locator('.mock-map-demo-cursor')).toHaveCount(0);
    await expect(page.locator('#marker-editor')).toHaveCount(0);
  });
});

test('main page: the demo cursor leaves when its page is no longer in front', async ({ page }) => {
  const stack = markerEditorStack(page);
  await stack.scrollIntoViewIfNeeded();
  const cursor = page.locator('.mock-map-demo-cursor');
  await expect(cursor).toBeVisible({ timeout: 20_000 });

  // The map page stays in the same grid cell once it is behind the front page, so an
  // intersection-only check kept its autoplay running out of sight.
  await swipeStack(page, stack, true);
  // Let the fold settle: the page briefly leaves the viewport mid-flip, and it was coming
  // back and restarting itself once it landed back in the shared grid cell.
  await page.waitForTimeout(3_000);
  expect(await cursor.count()).toBe(0);
});
