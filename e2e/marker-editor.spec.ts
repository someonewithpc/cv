import { expect, test } from '@playwright/test';

import {
  demoStack,
  frontPage,
  frontPageIndex,
  swipeStack,
  turnToPage,
  waitForIslandMounted,
} from './support/paperStack';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

function markerEditorStack(page: import('@playwright/test').Page) {
  return demoStack(page, 'Interactive Map Marker Editor');
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

test('editor page: live marker-editor diagram mounts', async ({ page }) => {
  const stack = markerEditorStack(page);
  await stack.scrollIntoViewIfNeeded();
  await turnToPage(stack, 'Marker Editor');
  const front = frontPage(stack, await frontPageIndex(stack));

  await waitForIslandMounted(front);
  // The embed only renders once the page reports itself visible to its own internal
  // observer and no other live marker-editor session is open — both true here, a fresh
  // isolated test starting straight on this page.
  await expect(front.locator('.marker-editor--embed')).toBeVisible({ timeout: 15_000 });
});

/**
 * One picker event on the shape fill, read back inside the same task. Nothing else can run
 * in between, however busy the page is, so a version that routes the drag through React
 * state fails this no matter the timing.
 */
function paintShapeFill(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const editor = document.querySelector('.marker-editor--embed');
    const input = editor?.querySelector<HTMLInputElement>('#marker-fill-color-marker-shape');
    const style = editor?.querySelector('#marker-content-shapeFill style') as SVGStyleElement | null;
    if (!input || !style) throw new Error('Marker editor shape fill controls not found');

    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setValue.call(input, '#123456');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    return {
      fill: (style.sheet?.cssRules[0] as CSSStyleRule | undefined)?.style.getPropertyValue('fill'),
      value: input.value,
    };
  });
}

test('editor page: a picker event paints the preview before React renders', async ({ page }) => {
  const stack = markerEditorStack(page);
  await stack.scrollIntoViewIfNeeded();
  await turnToPage(stack, 'Marker Editor');
  const front = frontPage(stack, await frontPageIndex(stack));

  await waitForIslandMounted(front);
  await expect(front.locator('.marker-editor--embed')).toBeVisible({ timeout: 15_000 });

  expect(await paintShapeFill(page)).toEqual({ fill: 'rgb(18, 52, 86)', value: '#123456' });

  // And the colour still reaches React, which is what a saved marker serializes from.
  // The map's walkthrough keeps reaching into this editor through its demo targets, colour
  // inputs included, so every attempt writes ours again before reading the rule back.
  await expect
    .poll(
      async () => {
        await paintShapeFill(page);
        return page.evaluate(() => (
          document.querySelector('.marker-editor--embed #marker-content-shapeFill style')?.textContent ?? ''
        ));
      },
      { timeout: 10_000 },
    )
    .toContain('#123456');
});

const VIEWPORTS = [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
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

      // It is a stamp in the border band: inside the paper margin under the frame line,
      // clear of the drawing and of the title block. A phone sheet has no room for it
      // there, so it takes a row of its own inside the frame above the title block.
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
      expect(placement).toEqual({
        insideBand: name === 'desktop',
        clearOfDrawing: true,
        clearOfTitleBlock: true,
      });
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

