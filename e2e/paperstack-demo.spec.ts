import { expect, test, type Page } from '@playwright/test';

import { demoStack, frontPageName, pressTurn, swipeStack, turnToPage } from './support/paperStack';

const PAGES = ['Paper Stack', 'The Fold', 'At Rest', 'Without Script'];

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
    // Three of the four sheets carry callouts; Stack.astro's script places each on its target.
    const overlays = stack.locator('svg[data-annotations]');
    await expect(overlays).toHaveCount(3);
    for (const overlay of await overlays.all()) {
      await expect(overlay).toHaveAttribute('data-annotations', 'js');
      expect(await overlay.locator('g[data-target]').count()).toBeGreaterThanOrEqual(4);
    }
  });

  test('the sheet heading under the callout overlay can be selected', async ({ page }) => {
    const stack = paperStackDemo(page);
    await stack.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    // The overlay is twice the artwork and lies over the heading; a drag across the heading
    // used to select callout text instead.
    const heading = stack.locator('.point').first();
    const box = (await heading.boundingBox())!;
    await page.mouse.move(box.x + 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    const selected = await page.evaluate(() => window.getSelection()?.toString() ?? '');
    expect(selected).toContain(await heading.innerText());
  });

  test('at rest page: the lamps read the sheet\'s own gate', async ({ page }) => {
    const stack = paperStackDemo(page);
    await stack.scrollIntoViewIfNeeded();
    await turnToPage(stack, 'At Rest');

    const board = stack.locator('[data-gate-board]');
    await expect(board).toHaveAttribute('data-gate-live', '');
    // In view and in front: the gate is open and no lamp is lit.
    await expect(board).toHaveAttribute('data-running', 'true');
    await expect(board.locator('[data-lit]')).toHaveCount(0);

    // The top of the page is nowhere near the stack.
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(board.locator('[data-reason="offscreen"]')).toHaveAttribute('data-lit', '');
    await expect(board).toHaveAttribute('data-running', 'false');

    await stack.scrollIntoViewIfNeeded();
    await expect(board).toHaveAttribute('data-running', 'true');
    await expect(board.locator('[data-lit]')).toHaveCount(0);
    expect(Number(await board.locator('[data-tally]').textContent())).toBeGreaterThanOrEqual(1);

    // A resize holds every gate; the board hears the hold as well as the release.
    await page.setViewportSize({ width: 1380, height: 900 });
    await expect(board.locator('[data-reason="resize"]')).toHaveAttribute('data-lit', '');
    await expect(board.locator('[data-reason="resize"]')).not.toHaveAttribute('data-lit', '', { timeout: 10_000 });

    // Turned away, the sheet is behind the front page.
    await pressTurn(stack, 'ArrowRight');
    await expect(board.locator('[data-reason="back-page"]')).toHaveAttribute('data-lit', '');
    await expect(board).toHaveAttribute('data-running', 'false');
  });
});

test.describe('without script', () => {
  test.use({ javaScriptEnabled: false });

  test('the gate board says there is no gate, and no lamp is lit', async ({ page }) => {
    await page.goto('/');
    const stack = page.locator('article.technical-drawing-stack[aria-label="Paper Stack"]');
    await stack.scrollIntoViewIfNeeded();

    const board = stack.locator('[data-gate-board]');
    await expect(board).not.toHaveAttribute('data-gate-live');
    await expect(board.locator('[data-lit]')).toHaveCount(0);
    await expect(board.locator('.without-script')).toBeVisible();
    await expect(board.locator('.with-script')).toBeHidden();
  });
});
