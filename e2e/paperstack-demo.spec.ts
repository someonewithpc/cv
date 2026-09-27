import { expect, test, type Page } from '@playwright/test';

import { demoStack, frontPage, frontPageName, swipeStack, turnToPage } from './support/paperStack';

const PAGES = ['Paper Stack', 'The Fold', 'Without Script'];

const paperStackDemo = (page: Page) => demoStack(page, 'Paper Stack');

test.describe('with script', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('paper stack: forward swipes visit every page in order, then wrap', async ({ page }) => {
    const stack = paperStackDemo(page);
    await stack.scrollIntoViewIfNeeded();
    await expect(stack).toHaveAttribute('aria-roledescription', 'paper stack');
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

  test('every sheet draws its callouts on the artwork', async ({ page }) => {
    const stack = paperStackDemo(page);
    await stack.scrollIntoViewIfNeeded();
    // Every sheet carries callouts; Stack.astro's script places each on its target.
    const overlays = stack.locator('svg[data-annotations]');
    await expect(overlays).toHaveCount(3);
    for (const overlay of await overlays.all()) {
      await expect(overlay).toHaveAttribute('data-annotations', 'js');
      expect(await overlay.locator('g[data-target]').count()).toBeGreaterThanOrEqual(3);
    }
  });

  test('the sheet heading under the callout overlay can be selected', async ({ page }) => {
    const stack = paperStackDemo(page);
    await stack.scrollIntoViewIfNeeded();
    await turnToPage(stack, 'The Fold');

    // The overlay is twice the artwork and lies over the heading; a drag across the heading
    // used to select callout text instead.
    const heading = frontPage(stack, 1).locator('.point').first();
    const box = (await heading.boundingBox())!;
    await page.mouse.move(box.x + 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    const selected = await page.evaluate(() => window.getSelection()?.toString() ?? '');
    expect(selected).toContain(await heading.innerText());
  });
});
