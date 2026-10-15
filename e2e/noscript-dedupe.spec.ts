import { expect, type Locator, type Page, test } from '@playwright/test';

const KEYBOARD_ATTRIBUTES = ['tabindex', 'aria-roledescription', 'aria-describedby'];

async function stackMetrics(stack: Locator) {
  return stack.evaluate((el) => ({
    display: getComputedStyle(el).display,
    pages: el.children.length,
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
    pageWidths: [...el.children].reduce((sum, page) => sum + page.getBoundingClientRect().width, 0),
  }));
}

/** The page grows a demo every few weeks, so the count comes off the page, never from here. */
async function stacks(page: Page): Promise<Locator[]> {
  const found = await page.locator('[data-paper-stack]').all();
  expect(found.length).toBeGreaterThanOrEqual(3);
  return found;
}

test.describe('with JavaScript off', () => {
  test.use({ javaScriptEnabled: false });

  test('every stack is a scroll row of its pages, rendered once', async ({ page }) => {
    await page.goto('/');

    const all = await stacks(page);
    // Each stack's pages are in the HTML once, under one root per stack.
    await expect(page.locator('[data-paper-stack-root]')).toHaveCount(all.length);

    for (const [i, stack] of all.entries()) {
      const { display, pages, scrollWidth, pageWidths } = await stackMetrics(stack);
      expect(display, `stack ${i}`).toBe('flex');
      expect(pages, `stack ${i}`).toBeGreaterThan(1);
      // A row of pages side by side, so every page is one scroll away rather than piled into
      // the single grid cell the scripted stack uses. Chrome's pages fill the row; Firefox's
      // leave the next page's edge in view.
      expect(scrollWidth, `stack ${i}`).toBeGreaterThanOrEqual(pageWidths - 1);

      const folds = stack.locator('.paper-fold, .paper-clip, .paper-flip-hint');
      for (const fold of await folds.all()) await expect(fold).toBeHidden();
    }
  });

  test('the stacks make no keyboard promise the scroll row cannot keep', async ({ page }) => {
    await page.goto('/');

    for (const stack of await stacks(page)) {
      for (const name of KEYBOARD_ATTRIBUTES) await expect(stack).not.toHaveAttribute(name);
      await expect(stack).not.toHaveAttribute('role');
    }
  });
});

test('with JavaScript on the script takes the stacks over and claims the arrow keys', async ({ page }) => {
  await page.goto('/');

  for (const [i, stack] of (await stacks(page)).entries()) {
    await expect(stack).toHaveAttribute('tabindex', '0');
    await expect(stack).toHaveAttribute('aria-roledescription', 'paper stack');
    await expect(stack).toHaveAccessibleDescription(/arrow keys/);
    await expect(stack).not.toHaveAttribute('aria-description');

    const { display, scrollWidth, clientWidth } = await stackMetrics(stack);
    expect(display, `stack ${i}`).toBe('grid');
    expect(scrollWidth, `stack ${i}`).toBeLessThan(clientWidth * 2);
  }
});
