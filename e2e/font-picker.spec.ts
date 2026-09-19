import { expect, test } from '@playwright/test';

import { frontPage, frontPageIndex, swipeStack, swipeToPage, waitForIslandMounted } from './support/paperStack';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

// By the name in the title block, not by index: the tagging tool's spec holds nth(3) and the
// next demo added to the page would move an index again.
function fontPickerStack(page: import('@playwright/test').Page) {
  return page
    .locator('article.technical-drawing-stack')
    .filter({ hasText: 'Interactive Map Font Picker' })
    .first();
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
  await swipeToPage(page, stack, 'Font Extraction');
  const front = frontPage(stack, await frontPageIndex(stack));

  // Four hops, in order, with the URL the walkthrough types at one end and the row it becomes
  // at the other
  await expect(front.locator('.step')).toHaveCount(4);
  await expect(front.locator('.field-input')).toHaveText('rust-lang.org');
  await expect(front.locator('.listing .rewritten')).toContainText('/api/font-proxy');
  await expect(front.locator('.select-row.new')).toHaveText('Alfa Slab One 400');
});

test('indicator page: the border runs by itself and the buttons take it over', async ({ page }) => {
  const stack = fontPickerStack(page);
  await stack.scrollIntoViewIfNeeded();
  await swipeToPage(page, stack, 'Loading Indicator');
  const front = frontPage(stack, await frontPageIndex(stack));

  await waitForIslandMounted(front);
  const fieldset = front.locator('[data-border-demo]');
  // It plays the request on its own once the page is the one in front
  await expect(fieldset).toHaveClass(/pending|success|error/, { timeout: 15_000 });

  // A press is the visitor taking it over, and it stays where they put it
  await front.getByRole('button', { name: 'error' }).click();
  await expect(fieldset).toHaveClass(/error/);
  await page.waitForTimeout(4_000);
  await expect(fieldset).toHaveClass(/error/);

  // The easing is plotted from the same numbers the stylesheet animates with
  await expect(front.locator('.timing figcaption')).toContainText('cubic-bezier(0.75, 0.25, 0.2, 0.2)');
});

test('held controls page: the drag leaves the plain column and holds the pinned one', async ({ page }) => {
  const stack = fontPickerStack(page);
  await stack.scrollIntoViewIfNeeded();
  await swipeToPage(page, stack, 'Held Controls');
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
  await swipeToPage(page, stack, 'Held Controls');
  const front = frontPage(stack, await frontPageIndex(stack));
  await waitForIslandMounted(front);

  // The closest the cursor's own tip gets to the thumb while that side is being dragged: the
  // drag moves the value and places the cursor from it on the same frame, so it stays on it
  const closest = { plain: Infinity, held: Infinity };
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline && (closest.plain > 16 || closest.held > 16)) {
    const sample = await page.evaluate(() => {
      const drawn = document.querySelector('.font-picker-cursor');
      if (!drawn || !drawn.className.includes('--dragging')) return null;
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

// Every sheet keeps clear sheet around its content: each layer's root pads by the one token in
// layers/_sheet.scss, in em of the sheet's own type, so whatever it paints stays off the
// frame line, the title block and the note's tab. The floor here is what the review asked for.
const SHEET_MARGIN_EM = 0.5;
const PAGES = [null, 'Font Extraction', 'Loading Indicator', 'Held Controls'] as const;
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

// The least clear sheet, in px, between anything the front sheet paints and its frame line
// (`toFrame`) or its title block and note tab (`toPieces`), against the margin the sheet's
// type sets
function clearSheet(front: import('@playwright/test').Locator) {
  return front.evaluate((wrapper, marginEm) => {
    const section = wrapper.querySelector(':scope > section')!;
    const root = section.querySelector(':scope > .content > *') as HTMLElement;
    const margin = marginEm * parseFloat(getComputedStyle(root).fontSize);

    // The frame line is drawn one pixel wide on the inside of the mat
    const style = getComputedStyle(section);
    const mat = parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft) + 1;
    const sheet = section.getBoundingClientRect();
    const frame = { left: sheet.left + mat, top: sheet.top + mat, right: sheet.right - mat, bottom: sheet.bottom - mat };

    const pieces = ['table', '.note-fold']
      .map((s) => section.querySelector(`:scope > ${s}, :scope > .aside > ${s}`)?.getBoundingClientRect())
      .filter((r): r is DOMRect => !!r && r.width > 0 && r.height > 0);

    // What paints: text, form controls, a drawing, or a box with a fill or a border. Grid
    // and flex wrappers do not, and a wrapper spanning the sheet says nothing about where
    // the ink is. The walkthrough's cursor and toasts go where they like.
    const paints = (el: Element) => {
      if (el.closest('[data-demo-cursor], .font-picker-toasts')) return false;
      if (el instanceof SVGElement) return el.tagName === 'svg';
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.display === 'contents' || cs.visibility === 'hidden') return false;
      if (['INPUT', 'SELECT', 'BUTTON', 'TEXTAREA', 'IMG'].includes(el.tagName)) return true;
      if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0) return true;
      return [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim());
    };
    const boxes = [...root.querySelectorAll('*')]
      .filter(paints)
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0);

    const toFrame = Math.min(...boxes.map((r) => Math.min(
      r.left - frame.left, frame.right - r.right, r.top - frame.top, frame.bottom - r.bottom,
    )));
    const toPieces = Math.min(...boxes.flatMap((r) => pieces.map((p) => Math.max(
      p.left - r.right, r.left - p.right, p.top - r.bottom, r.top - p.bottom,
    ))));
    return { margin, boxes: boxes.length, toFrame, toPieces };
  }, SHEET_MARGIN_EM);
}

for (const viewport of VIEWPORTS) {
  test.describe(`at ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    test('every sheet keeps the margin around its content', async ({ page }) => {
      test.setTimeout(150_000);
      const stack = fontPickerStack(page);
      await stack.scrollIntoViewIfNeeded();

      for (const name of PAGES) {
        if (name) await swipeToPage(page, stack, name);
        const front = frontPage(stack, await frontPageIndex(stack));
        if (await front.locator('[data-boot-module]').count()) await waitForIslandMounted(front);
        await expect.poll(async () => (await clearSheet(front)).boxes).toBeGreaterThan(0);

        const check = async (when: string) => {
          const gaps = await clearSheet(front);
          const where = `${name ?? 'picker'}${when}`;
          expect.soft(gaps.toFrame, `${where}: to the frame line`).toBeGreaterThanOrEqual(gaps.margin - 0.5);
          expect.soft(gaps.toPieces, `${where}: to the title block`).toBeGreaterThanOrEqual(gaps.margin - 0.5);
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
