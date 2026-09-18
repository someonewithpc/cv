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

test('discovery page: the dropdown illustration is reachable', async ({ page }) => {
  const stack = fontPickerStack(page);
  await stack.scrollIntoViewIfNeeded();
  await swipeToPage(page, stack, 'Font Discovery');
  const front = frontPage(stack, await frontPageIndex(stack));
  await expect(front.locator('section')).toBeVisible();

  // Every face the page carries is drawn in its own face, under the two subform entries
  const rows = front.locator('.list li');
  await expect(rows).toHaveCount(6);
  await expect(rows.last()).toHaveText('-- Extract fonts from URL --');
  await expect(front.locator('.sample')).toHaveCSS('font-family', /Special Elite/);
});

test('sources page: static font-sources illustration is reachable', async ({ page }) => {
  const stack = fontPickerStack(page);
  await stack.scrollIntoViewIfNeeded();
  await swipeToPage(page, stack, 'External Sources');
  const front = frontPage(stack, await frontPageIndex(stack));
  await expect(front.locator('section')).toBeVisible();
});

test('pinned page: static held-control illustration is reachable', async ({ page }) => {
  const stack = fontPickerStack(page);
  await stack.scrollIntoViewIfNeeded();
  await swipeToPage(page, stack, 'Pinned Controls');
  const front = frontPage(stack, await frontPageIndex(stack));
  await expect(front.locator('section')).toBeVisible();
});

test('feedback page: the sample border follows the state buttons', async ({ page }) => {
  const stack = fontPickerStack(page);
  await stack.scrollIntoViewIfNeeded();
  await swipeToPage(page, stack, 'Reactive Feedback');
  const front = frontPage(stack, await frontPageIndex(stack));

  await waitForIslandMounted(front);
  const fieldset = front.locator('[data-border-demo]');
  await expect(fieldset).toHaveClass(/idle/);
  await front.getByRole('button', { name: 'pending' }).click();
  await expect(fieldset).toHaveClass(/pending/);
  await front.getByRole('button', { name: 'success' }).click();
  await expect(fieldset).toHaveClass(/success/);
});
