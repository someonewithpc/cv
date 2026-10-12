import { demoStack, frontPage, frontPageIndex, swipeStack, turnToPage, waitForIslandMounted } from './support/paperStack';
import { clearSheet, SHEET_VIEWPORTS } from './support/sheetMargin';
import { expect, pageWait, test } from './support/timeScale';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

function fontPickerStack(page: import('@playwright/test').Page) {
  return demoStack(page, 'Interactive Map Font Picker');
}

test('main page: the picker mounts and a chosen face reaches the specimen', async ({ page }) => {
  const stack = fontPickerStack(page);
  await stack.scrollIntoViewIfNeeded();
  const front = frontPage(stack, await frontPageIndex(stack));

  const island = await waitForIslandMounted(front);
  const family = island.locator('select[data-demo-target="family"]');
  await expect(family).toBeVisible({ timeout: 15_000 });
  expect(await family.locator('option').count()).toBeGreaterThan(2);

  // Focus is the user taking over: the auto-play lets go and stays away while it lasts
  await family.focus();
  await expect(page.getByText('Demo paused')).toBeVisible();

  // Every option but the two subform entries is a face; the last face is not the default
  const faces = await family.locator('option:not([value^="--"])').evaluateAll((options) =>
    options.map((option) => (option as HTMLOptionElement).value),
  );
  const chosen = faces[faces.length - 1];
  await family.selectOption(chosen);
  const chosenFamily = JSON.parse(chosen).family as string;
  await expect(island.locator('.specimen figcaption')).toContainText(chosenFamily);
  await expect
    .poll(() => island.locator('.specimen-pangram').evaluate((el) => getComputedStyle(el).fontFamily))
    .toContain(chosenFamily);
});

test('main page: the size slider scales the specimen', async ({ page }) => {
  const stack = fontPickerStack(page);
  await stack.scrollIntoViewIfNeeded();
  const front = frontPage(stack, await frontPageIndex(stack));
  const island = await waitForIslandMounted(front);

  const pangram = island.locator('.specimen-pangram');
  await expect(pangram).toBeVisible({ timeout: 15_000 });
  const before = await pangram.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));

  const size = island.locator('input[data-demo-target="size"]');
  await size.focus();
  await size.fill('1.5');
  await expect.poll(() => pangram.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThan(before);
});

test('main page: the drawn cursor leaves when its page is no longer in front', async ({ page }) => {
  const stack = fontPickerStack(page);
  await stack.scrollIntoViewIfNeeded();
  const cursor = page.locator('.font-picker-cursor');
  await expect(cursor).toBeVisible({ timeout: 20_000 });

  // The picker's page keeps its grid cell behind the one turned to, so it still intersects
  // the viewport; only --page-index says it is covered.
  await swipeStack(page, stack, true);
  // The fold takes the page out of the viewport on its way, and coming back into it must
  // not start the walkthrough again.
  await page.waitForTimeout(3_000);
  expect(await cursor.count()).toBe(0);

  await swipeStack(page, stack, false);
  await expect(cursor).toBeVisible({ timeout: 20_000 });
});

test('extraction page: the pipeline is drawn from the URL to the new row', async ({ page }) => {
  const stack = fontPickerStack(page);
  await stack.scrollIntoViewIfNeeded();
  await turnToPage(stack, 'Font Extraction');
  const front = frontPage(stack, await frontPageIndex(stack));

  // Four hops, in order, with the URL the walkthrough types at one end and the row it becomes
  // at the other
  await expect(front.locator('.step')).toHaveCount(4);
  await expect(front.locator('.field-input')).toHaveText('rust-lang.org');
  await expect(front.locator('.listing .rewritten')).toContainText('/api/font-proxy');
  await expect(front.locator('.select-row.new')).toHaveText('Alfa Slab One 400');
});

test('indicator page: the border runs by itself and the buttons take it over', { tag: '@handover' }, async ({ page }) => {
  const stack = fontPickerStack(page);
  await stack.scrollIntoViewIfNeeded();
  await turnToPage(stack, 'Loading Indicator');
  const front = frontPage(stack, await frontPageIndex(stack));

  await waitForIslandMounted(front);
  const fieldset = front.locator('[data-border-demo]');
  // It plays the request on its own once the page is the one in front
  await expect(fieldset).toHaveClass(/pending|success|error/, { timeout: 15_000 });

  // A press is the visitor taking it over, and it stays where they put it
  await front.getByRole('button', { name: 'error' }).click();
  await expect(fieldset).toHaveClass(/error/);
  await pageWait(page, 4_000);
  await expect(fieldset).toHaveClass(/error/);

  // The easing is plotted from the same numbers the stylesheet animates with
  await expect(front.locator('.timing figcaption')).toContainText('cubic-bezier(0.75, 0.25, 0.2, 0.2)');
});

test('held controls page: the drag leaves the plain column and holds the pinned one', async ({ page }) => {
  const stack = fontPickerStack(page);
  await stack.scrollIntoViewIfNeeded();
  await turnToPage(stack, 'Held Controls');
  const front = frontPage(stack, await frontPageIndex(stack));

  await waitForIslandMounted(front);
  const plain = front.locator('[data-demo-target="size-plain"]');
  const held = front.locator('[data-demo-target="size-held"]');
  await expect(plain).toBeVisible({ timeout: 15_000 });

  // The walkthrough drags each column's size slider in turn
  await expect.poll(() => plain.inputValue(), { timeout: 30_000 }).not.toBe('1');
  // It measures how far the control has travelled from where the drag began
  await expect(front.locator('.grab-measure')).toBeVisible();

  // Hovering the sheet hands over, and the held column pins the row under the pointer
  await held.hover();
  await expect(page.getByText('Demo paused')).toBeVisible();
  await expect(front.locator('.pinned-box.is-held')).toBeVisible();
});

test.describe('on a landscape phone', () => {
  test.use({ viewport: { width: 844, height: 390 } });

  test('main page: the sample is sized from the sheet and stays on it', async ({ page }) => {
    const stack = fontPickerStack(page);
    await stack.scrollIntoViewIfNeeded();
    const front = frontPage(stack, await frontPageIndex(stack));
    const island = await waitForIslandMounted(front);
    await expect(island.locator('.specimen-pangram')).toBeVisible({ timeout: 15_000 });

    // Every part of the picker is on the sheet: no overflow, nothing past an edge
    const fit = await front.evaluate((wrapper) => {
      const section = wrapper.querySelector('section')!;
      const content = section.querySelector('.content')!;
      const sheet = section.getBoundingClientRect();
      const outside = [...section.querySelectorAll('.picker-layer *')].filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        return r.right > sheet.right + 1 || r.bottom > sheet.bottom + 1
          || r.left < sheet.left - 1 || r.top < sheet.top - 1;
      }).length;
      return {
        outside,
        overflowX: content.scrollWidth - content.clientWidth,
        overflowY: content.scrollHeight - content.clientHeight,
        pangram: parseFloat(getComputedStyle(section.querySelector('.specimen-pangram')!).fontSize),
      };
    });
    expect(fit.outside).toBe(0);
    expect(fit.overflowX).toBeLessThanOrEqual(2);
    expect(fit.overflowY).toBeLessThanOrEqual(2);

    // The sample reads off the sheet's own pixels, so a wide sheet sets it larger than this one
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect
      .poll(() => front.locator('.specimen-pangram').evaluate((el) => parseFloat(getComputedStyle(el).fontSize)))
      .toBeGreaterThan(fit.pangram);
  });
});

test('held controls page: the drawn cursor rides each slider it drags', async ({ page }) => {
  const stack = fontPickerStack(page);
  await stack.scrollIntoViewIfNeeded();
  await turnToPage(stack, 'Held Controls');
  const front = frontPage(stack, await frontPageIndex(stack));
  await waitForIslandMounted(front);

  // The closest the cursor's own tip gets to the thumb while that side is being dragged: the
  // drag moves the value and places the cursor from it on the same frame, so it stays on it
  const closest = { plain: Infinity, held: Infinity };
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline && (closest.plain > 16 || closest.held > 16)) {
    const sample = await page.evaluate(() => {
      const drawn = document.querySelector('.font-picker-cursor');
      if (!drawn?.hasAttribute('data-dragging')) return null;
      const c = drawn.getBoundingClientRect();
      return [...document.querySelectorAll<HTMLInputElement>('[data-demo-target^="size-"]')]
        .filter((el) => Number(el.value) > 1)
        .map((el) => {
          const r = el.getBoundingClientRect();
          const t = (Number(el.value) - Number(el.min)) / (Number(el.max) - Number(el.min));
          // The arrow's tip, not the box the SVG is drawn in
          return { side: el.dataset.demoTarget!.replace('size-', ''), d: Math.abs(r.left + 8 + (r.width - 16) * t - (c.left + 7)) };
        });
    });
    for (const { side, d } of sample ?? []) {
      closest[side as 'plain' | 'held'] = Math.min(closest[side as 'plain' | 'held'], d);
    }
    await page.waitForTimeout(80);
  }

  expect(closest.plain).toBeLessThanOrEqual(16);
  expect(closest.held).toBeLessThanOrEqual(16);
});

const PAGES = [null, 'Font Extraction', 'Loading Indicator', 'Held Controls'] as const;

const clearSheetOf = (front: import('@playwright/test').Locator) => clearSheet(front, { skip: '[data-demo-cursor], .font-picker-toasts' });

for (const viewport of SHEET_VIEWPORTS) {
  test.describe(`at ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    test('every sheet keeps the margin around its content', async ({ page }) => {
      test.setTimeout(150_000);
      const stack = fontPickerStack(page);
      await stack.scrollIntoViewIfNeeded();

      for (const name of PAGES) {
        if (name) await turnToPage(stack, name);
        const front = frontPage(stack, await frontPageIndex(stack));
        // The picker, held controls and feedback sheets mount an island each; the sources
        // sheet has none, so measure it as it is.
        const islands = '[data-font-picker-island], [data-held-controls-island], [data-feedback-island]';
        if (await front.locator(islands).count()) await waitForIslandMounted(front, islands);
        await expect.poll(async () => (await clearSheetOf(front)).boxes).toBeGreaterThan(0);

        const check = async (when: string) => {
          const gaps = await clearSheetOf(front);
          const where = `${name ?? 'picker'}${when}`;
          expect.soft(gaps.toFrame, `${where}: to the frame line`).toBeGreaterThanOrEqual(gaps.margin - 0.5);
          expect.soft(gaps.toPieces, `${where}: to the title block`).toBeGreaterThanOrEqual(gaps.margin - 0.5);
          expect.soft(gaps.outside, `${where}: text past the frame line`).toEqual([]);
        };
        await check('');

        // The held controls sheet is at its tallest while the walkthrough holds each column's
        // size at the top of its drag (HeldControlsApp's DRAG_TO): measure it there too
        if (name === 'Held Controls') {
          const top = (await stack.getAttribute('data-sheet-orientation')) === 'portrait' ? 1.5 : 1.75;
          for (const side of ['plain', 'held']) {
            // Read off the DOM, not a strict locator: the held column keeps a spacer clone of the
            // row it holds, so its target can match twice mid-drag
            const size = () => front.evaluate(
              (el, s) => Number(el.querySelector<HTMLInputElement>(`[data-demo-target="size-${s}"]`)?.value),
              side,
            );
            await expect.poll(size, { timeout: 45_000, intervals: [100] }).toBe(top);
            await check(`, ${side} column dragged`);
          }
        }
      }
    });
  });
}

test.describe('transport deck', () => {
  // A pointer's takeover is handed back after 2.5 s of page time; the waits below outlast it.
  test.use({ walkthroughRate: 2 });

  test('main page: the deck shows, and pause stops the walkthrough until play', async ({ page }) => {
    const stack = fontPickerStack(page);
    await stack.scrollIntoViewIfNeeded();
    const front = frontPage(stack, await frontPageIndex(stack));
    await waitForIslandMounted(front);

    const deck = front.locator('[data-demo-transport]');
    const cursor = front.locator('.font-picker-cursor');
    await expect(deck).toBeVisible({ timeout: 20_000 });
    await expect(deck).toHaveAttribute('data-state', 'playing');
    await expect(deck.locator('[data-demo-caption]')).toHaveText('AUTO PLAYING');
    await expect(cursor).toBeVisible({ timeout: 20_000 });

    // Reaching for the key is not a takeover of its own; the press is what pauses.
    await deck.locator('[data-demo-key="pause"]').click();
    await expect(deck).toHaveAttribute('data-state', 'user');
    await expect(deck.locator('[data-demo-key="pause"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(cursor).toHaveCount(0);
    await pageWait(page, 6_000);
    await expect(deck).toHaveAttribute('data-state', 'user');
    expect(await cursor.count()).toBe(0);

    await deck.locator('[data-demo-key="play"]').click();
    await expect(deck).toHaveAttribute('data-state', 'playing');
    await expect(cursor).toBeVisible({ timeout: 20_000 });
  });

  test('held controls page: pause keeps the sliders where they stand', async ({ page }) => {
    const stack = fontPickerStack(page);
    await stack.scrollIntoViewIfNeeded();
    await turnToPage(stack, 'Held Controls');
    const front = frontPage(stack, await frontPageIndex(stack));

    const deck = front.locator('[data-demo-transport]');
    const cursor = front.locator('.font-picker-cursor');
    await expect(deck).toHaveAttribute('data-state', 'playing', { timeout: 20_000 });
    await expect(cursor).toBeVisible({ timeout: 20_000 });

    await deck.locator('[data-demo-key="pause"]').click();
    await expect(deck).toHaveAttribute('data-state', 'user');
    await expect(cursor).toHaveCount(0);
    await pageWait(page, 6_000);
    expect(await cursor.count()).toBe(0);
  });

  test('loading indicator page: pause holds the border on its state', async ({ page }) => {
    const stack = fontPickerStack(page);
    await stack.scrollIntoViewIfNeeded();
    await turnToPage(stack, 'Loading Indicator');
    const front = frontPage(stack, await frontPageIndex(stack));

    const deck = front.locator('[data-demo-transport]');
    const fieldset = front.locator('[data-border-demo]');
    await expect(deck).toHaveAttribute('data-state', 'playing', { timeout: 20_000 });

    await deck.locator('[data-demo-key="pause"]').click();
    await expect(deck).toHaveAttribute('data-state', 'user');
    const held = await fieldset.getAttribute('class');
    // Longer than the whole request cycle, so a running walkthrough would have moved it.
    await pageWait(page, 12_000);
    expect(await fieldset.getAttribute('class')).toBe(held);

    await deck.locator('[data-demo-key="reset"]').click();
    await expect(deck).toHaveAttribute('data-state', 'playing');
  });
});

// The cursor's page rect is cached from the first frame of a glide, so only a window scroll that
// lands mid-glide leaves it holding the page's old place. The control the walkthrough then
// changes is where the arrow's tip, 7 px in from its box's left, has to be
for (const width of [1440, 390]) test(`main page: the drawn cursor reaches its control after the window scrolls mid-glide at ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.reload();
  await fontPickerStack(page).scrollIntoViewIfNeeded();
  await expect(page.locator('.font-picker-cursor')).toBeVisible({ timeout: 20_000 });

  await page.evaluate(() => new Promise<void>((resolve) => {
    const top = () => document.querySelector('.font-picker-cursor')?.getBoundingClientRect().top ?? 0;
    let last = top();
    const tick = () => {
      if (Math.abs(top() - last) > 4) {
        document.addEventListener('change', (event) => {
          const el = event.target as HTMLElement;
          const c = document.querySelector('.font-picker-cursor')?.getBoundingClientRect();
          if (!c || !el.dataset.demoTarget || (window as any).tipMiss !== undefined) return;
          const r = el.getBoundingClientRect();
          (window as any).tipMiss = Math.hypot(
            Math.max(r.left - (c.left + 7), 0, c.left + 7 - r.right),
            Math.max(r.top - c.top, 0, c.top - r.bottom),
          );
        }, true);
        window.scrollBy(0, 200);
        resolve();
        return;
      }
      last = top();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
  await expect.poll(() => page.evaluate(() => (window as any).tipMiss ?? Infinity), { timeout: 20_000 }).toBeLessThan(24);
});
