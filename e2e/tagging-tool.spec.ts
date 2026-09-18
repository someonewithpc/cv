import { expect, test } from '@playwright/test';

import { frontPage, frontPageIndex, frontPageName, swipeStack, swipeToPage } from './support/paperStack';

const PAGES = ['Library Tagging Tool', 'Shared Value', 'Simulated Caret', 'Completed Objects'];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

function taggingToolStack(page: import('@playwright/test').Page) {
  return page.locator('article.technical-drawing-stack').nth(3);
}

async function mountedTool(page: import('@playwright/test').Page) {
  const stack = taggingToolStack(page);
  await stack.scrollIntoViewIfNeeded();
  const front = frontPage(stack, await frontPageIndex(stack));

  const mount = front.locator('.tagging-grid-demo');
  await expect(mount).toHaveAttribute('data-mounted', 'true', { timeout: 15_000 });
  const tool = front.locator('.tagging-tool[data-live]');
  // Hovering the tool is how a real visitor takes it over from the walkthrough
  // (taggingTool.ts's pointerenter/focusin -> stop); without it the first row keeps
  // typing, switching property and replaying on its own.
  await tool.hover();
  await expect(tool).toHaveAttribute('data-autoplay', 'user');
  // The walkthrough may have switched property before the handover landed; every test
  // below starts from the property the page opens on.
  await tool.locator('.property-select').selectOption('table color');
  return { stack, front, tool };
}

test('tagging tool: forward swipes visit every page in order, then wrap', async ({ page }) => {
  const stack = taggingToolStack(page);
  await stack.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  expect(await stack.locator(':scope > div').count()).toBe(PAGES.length);
  expect(await frontPageName(stack)).toBe(PAGES[0]);

  for (let i = 1; i < PAGES.length; i += 1) {
    await swipeStack(page, stack, true);
    expect(await frontPageName(stack), `page ${i} after ${i} forward swipe(s)`).toBe(PAGES[i]);
  }

  await swipeStack(page, stack, true);
  expect(await frontPageName(stack)).toBe(PAGES[0]);
});

test('main page: the walkthrough types with a drawn cursor and hands over on hover', async ({ page }) => {
  const stack = taggingToolStack(page);
  await stack.scrollIntoViewIfNeeded();
  const front = frontPage(stack, await frontPageIndex(stack));
  await expect(front.locator('.tagging-grid-demo')).toHaveAttribute('data-mounted', 'true', { timeout: 15_000 });

  const tool = front.locator('.tagging-tool[data-live]');
  const cursor = front.locator('.tagging-cursor');
  await expect(tool).toHaveAttribute('data-autoplay', 'playing');
  await expect(cursor).toBeVisible({ timeout: 10_000 });

  // It fills the whole row from the one shared field, mirroring as it types.
  const round = tool.locator('.grouped-objects[data-group="round"]');
  await expect(round.locator('.object-value').first()).not.toHaveValue('', { timeout: 15_000 });

  await tool.hover();
  await expect(tool).toHaveAttribute('data-autoplay', 'user');
  await expect(cursor).toBeHidden();

  // Handover means handover: nothing types itself after this.
  const settled = await round.locator('.shared-value').inputValue();
  await page.waitForTimeout(1_500);
  expect(await round.locator('.shared-value').inputValue()).toBe(settled);
});

test('main page: the shared value mirrors onto the base and every style, and Enter saves them all', async ({ page }) => {
  const { tool } = await mountedTool(page);

  const gold = tool.locator('.grouped-objects[data-group="gold"]');
  const shared = gold.locator('.shared-value');
  const objects = gold.locator('.object-value');

  await shared.click();
  await shared.fill('bright gold');
  await expect(objects.first()).toHaveValue('bright gold');

  // auto_submit_form: Enter blurs the field and the change submits with update_styles.
  await shared.press('Enter');

  const count = await objects.count();
  for (let i = 0; i < count; i += 1) {
    await expect(objects.nth(i)).toHaveValue('Bright Gold');
  }
  // Its last gap is filled, so the object leaves the list the way set.js.erb drops it.
  await expect(gold).toBeHidden();
  await expect(tool.locator('.demo-note')).toBeVisible();
});

test('main page: differing style values keep the shared input open and flag the overrides', async ({ page }) => {
  const { tool } = await mountedTool(page);

  const gold = tool.locator('.grouped-objects[data-group="gold"]');
  await expect(gold.locator('.shared-form')).toHaveAttribute('data-shared', 'false');
  await expect(gold.locator('.shared-value')).toBeEnabled();
  await expect(gold.locator('.shared-value')).toHaveAttribute('placeholder', 'Overrides: White and Beige');
});

test('main page: picking another property brings up the values already stored for it', async ({ page }) => {
  const { tool } = await mountedTool(page);

  const round = tool.locator('.grouped-objects[data-group="round"]');
  await tool.locator('.property-select').selectOption('linen');

  await expect(round.locator('.object-value').first()).toHaveValue('Ivory Satin');
  await expect(round.locator('.shared-value')).toHaveAttribute('placeholder', 'Overrides: Ivory Satin');

  // The last style has no linen value, which is why the object is still listed.
  await expect(round.locator('.object-value').last()).toHaveValue('');
});

test('shared value page: the mirroring blueprint diagram is shown', async ({ page }) => {
  const stack = taggingToolStack(page);
  await stack.scrollIntoViewIfNeeded();
  await swipeToPage(page, stack, 'Shared Value');
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

test('completed objects page: the leaving-the-list blueprint diagram is shown', async ({ page }) => {
  const stack = taggingToolStack(page);
  await stack.scrollIntoViewIfNeeded();
  await swipeToPage(page, stack, 'Completed Objects');
  const front = frontPage(stack, await frontPageIndex(stack));
  // This page also embeds a non-live Grid for illustration, which has its own
  // .grouped-objects blocks; scope to the page's own blueprint section.
  await expect(front.locator('section.blueprint')).toBeVisible();
  await expect(front.locator('.grouped-objects.completing')).toHaveCount(1);
});
