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
