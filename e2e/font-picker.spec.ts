import { expect, test } from '@playwright/test';

import { frontPage, frontPageIndex, swipeStack, swipeToPage, waitForIslandMounted } from './support/paperStack';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

function fontPickerStack(page: import('@playwright/test').Page) {
  return page.locator('article.technical-drawing-stack').nth(3);
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
