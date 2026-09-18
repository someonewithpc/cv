import { expect, type Locator, test } from '@playwright/test';

const KEYBOARD_ATTRIBUTES = ['tabindex', 'aria-roledescription', 'aria-description'];

async function stackMetrics(stack: Locator) {
  return stack.evaluate((el) => ({
    display: getComputedStyle(el).display,
    pages: el.children.length,
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
}

test.describe('with JavaScript off', () => {
  test.use({ javaScriptEnabled: false });

  test('every stack is a scroll row of its pages, rendered once', async ({ page }) => {
    await page.goto('/');

    const stacks = page.locator('[data-paper-stack]');
    await expect(stacks).toHaveCount(3);
    // The pages used to be in the HTML twice: this flat copy and the scripted stack.
    await expect(page.locator('[data-paper-stack-root]')).toHaveCount(3);

    for (const stack of await stacks.all()) {
      const { display, pages, scrollWidth, clientWidth } = await stackMetrics(stack);
      expect(display).toBe('flex');
      expect(pages).toBe(6);
      // A row of full-width pages, so every page is one scroll away rather than piled
      // into the single grid cell the scripted stack uses.
      expect(scrollWidth).toBeGreaterThanOrEqual(clientWidth * pages - 1);

      const folds = stack.locator('.paper-fold, .paper-clip, .paper-flip-hint');
      for (const fold of await folds.all()) await expect(fold).toBeHidden();
    }
  });

  test('the stacks make no keyboard promise the scroll row cannot keep', async ({ page }) => {
    await page.goto('/');

    const stack = page.locator('[data-paper-stack]').first();
    for (const name of KEYBOARD_ATTRIBUTES) await expect(stack).not.toHaveAttribute(name);
    await expect(stack).toHaveAttribute('role', 'region');
  });
});

test('with JavaScript on the script takes the stack over and claims the arrow keys', async ({ page }) => {
  await page.goto('/');

  const stack = page.locator('[data-paper-stack]').first();
  await expect(stack).toHaveAttribute('tabindex', '0');
  await expect(stack).toHaveAttribute('aria-roledescription', 'paper stack');
  await expect(stack).toHaveAttribute('aria-description', /arrow keys/);

  const { display, scrollWidth, clientWidth } = await stackMetrics(stack);
  expect(display).toBe('grid');
  expect(scrollWidth).toBeLessThan(clientWidth * 2);
});
