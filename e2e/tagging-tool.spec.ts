import { expect, test } from '@playwright/test';

import { frontPage, frontPageIndex, swipeToPage } from './support/paperStack';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

function taggingToolStack(page: import('@playwright/test').Page) {
  return page.locator('article.technical-drawing-stack').nth(3);
}

test('main page: typing a shared value mirrors it onto every member and submitting tags them all', async ({ page }) => {
  const stack = taggingToolStack(page);
  await stack.scrollIntoViewIfNeeded();
  const front = frontPage(stack, await frontPageIndex(stack));

  const mount = front.locator('.tagging-grid-demo');
  await expect(mount).toHaveAttribute('data-mounted', 'true', { timeout: 15_000 });
  const tool = front.locator('.tagging-tool[data-live]');

  const chiavari = tool.locator('.grouped-objects[data-group="chiavari"]');
  const shared = chiavari.locator('.shared-value');
  const members = chiavari.locator('.image-thumbnail .in-place-input');

  // Clicking the shared input is how a real visitor takes the group over from its
  // auto-play loop (taggingTool.ts's pointerenter/focusin -> stop), same handoff the
  // other demos require before asserting on typed input.
  await shared.click();
  await shared.fill('Bright Gold');
  await expect(members.first()).toHaveValue('Bright Gold');

  await chiavari.locator('.shared-submit').click();

  const count = await members.count();
  for (let i = 0; i < count; i += 1) {
    await expect(members.nth(i)).toHaveValue('Bright Gold');
  }
  await expect(chiavari.locator('.image-thumbnail[data-missing="true"]')).toHaveCount(0);
});

test('main page: the only-missing filter hides groups that are already fully tagged', async ({ page }) => {
  const stack = taggingToolStack(page);
  await stack.scrollIntoViewIfNeeded();
  const front = frontPage(stack, await frontPageIndex(stack));

  const mount = front.locator('.tagging-grid-demo');
  await expect(mount).toHaveAttribute('data-mounted', 'true', { timeout: 15_000 });
  const tool = front.locator('.tagging-tool[data-live]');
  // Hovering the tool hands control over from the auto-playing Chiavari group so its
  // data-missing flag settles before the assertions below read it.
  await tool.hover();

  const banquet = tool.locator('.grouped-objects[data-group="banquet"]');
  const chiavari = tool.locator('.grouped-objects[data-group="chiavari"]');
  await expect(banquet).toBeVisible();
  await expect(chiavari).toBeVisible();

  await tool.locator('.only-missing').check();
  await expect(tool).toHaveAttribute('data-only-missing', 'true');

  // Banquet's members already carry a value; Chiavari's start untagged.
  await expect(banquet).toBeHidden();
  await expect(chiavari).toBeVisible();
});

test('shared group input page: the mirroring blueprint diagram is shown', async ({ page }) => {
  const stack = taggingToolStack(page);
  await stack.scrollIntoViewIfNeeded();
  await swipeToPage(page, stack, 'Shared Group Input');
  const front = frontPage(stack, await frontPageIndex(stack));
  await expect(front.locator('section.blueprint')).toBeVisible();
});

test('simulated caret page: the caret-math blueprint diagram is shown', async ({ page }) => {
  const stack = taggingToolStack(page);
  await stack.scrollIntoViewIfNeeded();
  await swipeToPage(page, stack, 'Simulated Caret');
  const front = frontPage(stack, await frontPageIndex(stack));
  await expect(front.locator('section.blueprint')).toBeVisible();
});

test('missing values page: the filtered-grid blueprint diagram is shown', async ({ page }) => {
  const stack = taggingToolStack(page);
  await stack.scrollIntoViewIfNeeded();
  await swipeToPage(page, stack, 'Missing Values');
  const front = frontPage(stack, await frontPageIndex(stack));
  // This page also embeds a non-live Grid for illustration, which has its own
  // .grouped-objects <section> per group — scope to the page's own blueprint section
  // so the locator isn't ambiguous between the two.
  await expect(front.locator('section.blueprint')).toBeVisible();
});
