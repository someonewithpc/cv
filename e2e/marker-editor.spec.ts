import { expect, test } from '@playwright/test';

import {
  demoStack,
  frontPage,
  frontDeck,
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

test('main page on a narrow landscape sheet: the map fills it and the selector keeps clear of the title block', async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 900 });
  const stack = markerEditorStack(page);
  await stack.scrollIntoViewIfNeeded();
  await expect(stack).toHaveAttribute('data-sheet-width', 'narrow');
  const front = frontPage(stack, await frontPageIndex(stack));
  const overlay = (await waitForIslandMounted(front)).locator('.mock-map-overlay');
  await overlay.focus();
  await expect(page.getByText('Demo paused')).toBeVisible();
  await overlay.locator('button.space-pin').first().click();
  await expect(front.locator('.marker-editing-overlay')).toBeVisible();

  const map = (await front.locator('.mock-map-demo').boundingBox())!;
  const sheet = (await front.locator('section').first().boundingBox())!;
  const block = (await front.locator('section > table').first().boundingBox())!;
  const selector = (await front.locator('.marker-editing-overlay').boundingBox())!;
  expect(map.width).toBeGreaterThan(sheet.width * 0.9);
  const apart = selector.x + selector.width <= block.x || selector.y + selector.height <= block.y;
  expect(apart).toBe(true);
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

/**
 * Clicks a selector inside the embed through the DOM, not through Playwright's pointer
 * simulation: the autoplaying walkthrough keeps moving its own cursor layer over this page
 * (as the picker test above notes) and intercepts a real pointer click mid-test.
 */
function clickInEditor(page: import('@playwright/test').Page, selector: string) {
  return page.evaluate((selector) => {
    const editor = document.querySelector('.marker-editor--embed');
    const el = editor?.querySelector<HTMLElement>(selector);
    if (!el) throw new Error(`Marker editor control not found: ${selector}`);
    el.click();
  }, selector);
}

/** Sets the font weight slider's value and dispatches the input event React listens for. */
function setFontWeight(page: import('@playwright/test').Page, value: number) {
  return page.evaluate((value) => {
    const editor = document.querySelector('.marker-editor--embed');
    const input = editor?.querySelector<HTMLInputElement>('#marker-font-weight');
    if (!input) throw new Error('Marker editor font weight control not found');

    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setValue.call(input, String(value));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

test('editor page: the decoration font list has no duplicate rows, and the weight slider follows a reset', async ({ page }) => {
  const stack = markerEditorStack(page);
  await stack.scrollIntoViewIfNeeded();
  await turnToPage(stack, 'Marker Editor');
  const front = frontPage(stack, await frontPageIndex(stack));

  await waitForIslandMounted(front);
  const editor = front.locator('.marker-editor--embed');
  await expect(editor).toBeVisible({ timeout: 15_000 });

  // Decoration Font is disabled under the default decoration (Custom Icon); Free Text
  // leaves it enabled.
  await clickInEditor(page, 'summary[data-demo-target="editor:step:decoration"]');
  await clickInEditor(page, 'li[data-demo-target="editor:decoration:freeText"]');

  await clickInEditor(page, 'summary[data-demo-target="editor:step:decorationFont"]');

  const labels = await editor.locator('#marker-font-family option').allTextContents();
  expect(new Set(labels).size).toBe(labels.length);

  const weightInput = editor.locator('#marker-font-weight');
  await expect(weightInput).toHaveValue('600');

  await setFontWeight(page, 300);
  await expect(weightInput).toHaveValue('300');

  await clickInEditor(page, 'button[title="Reset"]');
  await expect(weightInput).toHaveValue('600');
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

      const deck = frontDeck(stack, front);
      const play = deck.locator('[data-demo-key="play"]');
      const pause = deck.locator('[data-demo-key="pause"]');
      const reset = deck.locator('[data-demo-key="reset"]');

      await expect(deck).toHaveAttribute('data-state', 'playing', { timeout: 20_000 });
      await expect(deck).toContainText('AUTO PLAYING');

      // It is a stamp in the border band: inside the paper margin under the frame line,
      // clear of the drawing and of the title block. A phone sheet's band cannot hold it,
      // so it moves under the page into the callout's card.
      const placement = await deck.evaluate((el) => {
        // In the card, the deck is measured against the sheet it came off.
        const inCard = el.parentElement!.matches('.callout-card');
        const section = inCard
          ? el.closest('section.callout')!.querySelector('article.technical-drawing-stack > * > section')!
          : el.closest('section')!;
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
          inCard,
          insideBand: box.top >= sheet.bottom - band - 1 && box.bottom <= sheet.bottom + 1,
          clearOfDrawing: clearOf(section.querySelector('.content')),
          clearOfTitleBlock: clearOf(section.querySelector('table')),
        };
      });
      expect(placement).toEqual({
        inCard: name === 'phone',
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

  test.describe(`marker editor dialog at ${name} width`, () => {
    test.use({ viewport });

    test('takes focus on open, keeps Tab inside, and gives it back on Escape', async ({ page }) => {
      const stack = markerEditorStack(page);
      await stack.scrollIntoViewIfNeeded();
      const front = frontPage(stack, await frontPageIndex(stack));
      const island = await waitForIslandMounted(front);
      const overlay = island.locator('.mock-map-overlay');
      const pins = overlay.locator('button.space-pin');
      await expect(pins.first()).toBeVisible({ timeout: 15_000 });

      // As in the picker test above: the pins answer once the visitor has taken over.
      await overlay.focus();
      await expect(page.getByText('Demo paused')).toBeVisible();
      await pins.first().click();

      const create = page.getByRole('option', { name: 'Create new marker' });
      await create.focus();
      await page.keyboard.press('Enter');

      const editor = page.locator('#marker-editor');
      await expect(editor).toBeVisible();
      const goBack = editor.getByRole('button', { name: 'Go back' });
      await expect(goBack).toBeFocused();

      // Shift+Tab off the first control lands on the dialog's last one, and Tab from
      // there comes back round: focus never leaves the dialog.
      await page.keyboard.press('Shift+Tab');
      await expect(editor.locator(':focus')).toHaveCount(1);
      await expect(goBack).not.toBeFocused();
      await page.keyboard.press('Tab');
      await expect(goBack).toBeFocused();

      await page.keyboard.press('Escape');
      await expect(editor).toHaveCount(0);
      await expect(create).toBeFocused();
    });

    test('hovering a header button moves nothing', async ({ page }) => {
      const stack = markerEditorStack(page);
      await stack.scrollIntoViewIfNeeded();
      const front = frontPage(stack, await frontPageIndex(stack));
      const island = await waitForIslandMounted(front);
      const overlay = island.locator('.mock-map-overlay');
      const pins = overlay.locator('button.space-pin');
      await expect(pins.first()).toBeVisible({ timeout: 15_000 });
      await overlay.focus();
      await pins.first().click();
      await page.getByRole('option', { name: 'Create new marker' }).click();

      const editor = page.locator('#marker-editor');
      await expect(editor).toBeVisible();
      const header = editor.getByRole('button', { name: 'Go back' }).locator('..');
      const kids = header.locator('> *');
      const count = await kids.count();
      expect(count).toBeGreaterThan(1);
      const boxes = async () => Promise.all(Array.from({ length: count }, (_, i) => kids.nth(i).boundingBox()));
      await page.mouse.move(0, 0);
      const before = await boxes();
      for (let i = 0; i < count; i++) {
        await kids.nth(i).hover();
        expect(await boxes()).toEqual(before);
      }
    });
  });
}

test('Ctrl+Z undoes from inside the marker editor but leaves text fields their own undo', async ({ page }) => {
  const stack = markerEditorStack(page);
  await stack.scrollIntoViewIfNeeded();
  const front = frontPage(stack, await frontPageIndex(stack));
  const island = await waitForIslandMounted(front);
  const overlay = island.locator('.mock-map-overlay');
  const pins = overlay.locator('button.space-pin');
  await expect(pins.first()).toBeVisible({ timeout: 15_000 });
  const undoToasts = island.locator('.mock-map-toast', { hasText: 'Undo' });

  // Outside the demo the shortcut is left alone.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  // A count, not expect().toHaveCount(0): that retries, and would pass once a toast left.
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);
  expect(await undoToasts.count()).toBe(0);

  await overlay.focus();
  await expect(page.getByText('Demo paused')).toBeVisible();
  await pins.first().click();
  await page.getByRole('option', { name: 'Create new marker' }).click();

  const editor = page.locator('#marker-editor');
  await expect(editor.getByRole('button', { name: 'Go back' })).toBeFocused();
  await page.keyboard.press('Control+z');
  await expect(undoToasts).toHaveCount(1);
  await expect(undoToasts).toHaveCount(0, { timeout: 10_000 });

  await editor.getByText('Decoration', { exact: true }).click();
  await editor.getByRole('option', { name: 'Free Text' }).click();
  const text = editor.locator('#marker-free-text');
  await text.fill('Hall');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);
  expect(await undoToasts.count()).toBe(0);
});

test('Ctrl+Z and Cmd+Z undo after a plain click on the sheet, with nothing focused first', async ({ page }) => {
  const stack = markerEditorStack(page);
  await stack.scrollIntoViewIfNeeded();
  const front = frontPage(stack, await frontPageIndex(stack));
  const island = await waitForIslandMounted(front);
  const overlay = island.locator('.mock-map-overlay');
  await expect(overlay.locator('button.space-pin').first()).toBeVisible({ timeout: 15_000 });
  const undoToasts = island.locator('.mock-map-toast', { hasText: 'Undo' });
  const sheet = overlay.locator('xpath=ancestor::section[1]');

  for (const key of ['Control+z', 'Meta+z']) {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    // Bare paper, not the map: nothing there takes focus, so the stack around it would.
    await sheet.click({ position: { x: 4, y: 4 } });
    await expect(sheet).toBeFocused();
    await page.keyboard.press(key);
    await expect(undoToasts).toHaveCount(1);
    await expect(undoToasts).toHaveCount(0, { timeout: 10_000 });
  }

  // A page element outside the demo keeps the shortcut to itself.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);
  expect(await undoToasts.count()).toBe(0);
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the map walkthrough waits paused and the deck says so', async ({ page }) => {
    const stack = markerEditorStack(page);
    await stack.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    const front = frontPage(stack, await frontPageIndex(stack));
    await waitForIslandMounted(front);

    const deck = front.locator('[data-demo-transport]');
    await expect(deck).toHaveAttribute('data-state', 'paused', { timeout: 20_000 });
    await expect(deck).toContainText('ANIMATION PAUSED');
    for (const key of ['reset', 'play', 'pause']) {
      await expect(deck.locator(`[data-demo-key="${key}"]`)).toBeEnabled();
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

