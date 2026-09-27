import { expect, test } from '@playwright/test';

import { demoStack, frontPageName } from './support/paperStack';

test.describe('skip link', () => {
  test('moves focus and the viewport to the content start, and the next Tab reaches a real control', async ({ page }) => {
    await page.goto('/');

    await page.keyboard.press('Tab');
    await expect(page.locator('.skip-link')).toBeFocused();

    await page.keyboard.press('Enter');
    // The native anchor jump plus the tabindex="-1" focus move both land in the same task; give
    // the browser one to settle before reading document.activeElement.
    await expect(page.locator('main#main')).toBeFocused();

    await page.keyboard.press('Tab');
    // The theme picker (also in the DOM before <main>, but a Tab stop of its own) and every
    // section start (tabindex="-1") are accesskey landing spots, not sequential Tab stops, so
    // the next real stop after the skip link is the first content control: the mailto link.
    await expect(page.getByRole('link', { name: /^contact@hsal\.es/ })).toBeFocused();
  });
});

test.describe('access keys', () => {
  // CDP does not deliver Alt+key (or Alt+Shift+key) to a page as a real accesskey activation
  // in this Chrome build — confirmed directly against both headless and headed system Chrome,
  // with Playwright's keyboard API and with raw CDP Input.dispatchKeyEvent. So this suite
  // checks what a script can check: every accesskey is present, unique, and lands on the right
  // element once given focus, the legend names them correctly, and the legend's CSS-only
  // reveal responds to the same focus the skip link (or a turn key) would carry. Pressing the
  // real key combination on the built site is Hugo's to try by hand.

  test('every accesskey is unique and on the element the legend says', async ({ page }) => {
    await page.goto('/');

    const targets: Record<string, { locator: () => ReturnType<typeof page.locator>, focusable: boolean }> = {
      '1': { locator: () => page.locator('.skip-link'), focusable: true },
      '2': { locator: () => page.locator('#theme-picker'), focusable: true },
      '3': { locator: () => page.locator('#career'), focusable: true },
      '4': { locator: () => page.locator('#bill-of-materials'), focusable: true },
      '5': { locator: () => page.locator('#demos'), focusable: true },
      '6': { locator: () => page.locator('#open-source'), focusable: true },
      '7': { locator: () => page.locator('.page-turn-key[data-turn="ArrowLeft"]'), focusable: false },
      '8': { locator: () => page.locator('.page-turn-key[data-turn="ArrowRight"]'), focusable: false },
    };

    const all = await page.locator('[accesskey]').evaluateAll((els) => els.map((el) => el.getAttribute('accesskey')));
    expect(all.sort()).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);

    for (const [key, { locator }] of Object.entries(targets)) {
      await expect(locator()).toHaveAttribute('accesskey', key);
    }
  });

  test('the legend lists all eight keys and their targets', async ({ page }) => {
    await page.goto('/');
    const items = await page.locator('.accesskey-legend li').allTextContents();
    expect(items).toHaveLength(8);
    expect(items[0]).toContain('Skip to content');
    expect(items[1]).toContain('Theme picker');
    expect(items[6]).toContain('Previous page');
    expect(items[7]).toContain('Next page');
    for (const [index, key] of ['1', '2', '3', '4', '5', '6', '7', '8'].entries()) {
      await expect(page.locator('.accesskey-legend li').nth(index).locator('kbd')).toHaveText(key);
    }
  });

  test('the legend is hidden at rest, shown while the skip link has focus, and hidden again once focus moves on', async ({ page }) => {
    await page.goto('/');
    const legend = page.locator('.accesskey-legend');

    await expect(legend).toHaveCSS('opacity', '0');

    await page.keyboard.press('Tab');
    await expect(page.locator('.skip-link')).toBeFocused();
    await expect(legend).toHaveCSS('opacity', '1');

    await page.keyboard.press('Tab');
    await expect(legend).toHaveCSS('opacity', '0');
  });

  test('the legend stays visible while a page-turn key has focus', async ({ page }) => {
    await page.goto('/');
    const legend = page.locator('.accesskey-legend');
    await page.evaluate(() => document.querySelector<HTMLElement>('.page-turn-key[data-turn="ArrowRight"]')?.focus());
    await expect(legend).toHaveCSS('opacity', '1');
  });

  test('the theme picker and each section take a visible ring when their accesskey target is focused', async ({ page }) => {
    await page.goto('/');
    for (const id of ['theme-picker', 'career', 'bill-of-materials', 'demos', 'open-source']) {
      const el = page.locator(`#${id}`);
      await el.evaluate((node) => (node as HTMLElement).focus());
      await expect(el).toBeFocused();
      await expect(el).toHaveCSS('outline-style', 'solid');
    }
  });

  test('the next/previous page keys turn the stack that has focus and hand focus back to it', async ({ page }) => {
    await page.goto('/');
    const stack = demoStack(page, 'Visrez Animated Loading Logo');
    await stack.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    for (let i = 0; i < 200; i += 1) {
      await page.keyboard.press('Tab');
      if (await stack.evaluate((el) => el === document.activeElement)) break;
    }
    await expect(stack).toBeFocused();

    const before = await frontPageName(stack);
    // A real accesskey press cannot be simulated here (see the note above): .focus() is what
    // the browser's own accesskey handling would do first, and it fires the same
    // focusin/relatedTarget the Layout.astro script reads, so this exercises the same code
    // path a real Alt+8 press would reach.
    await page.evaluate(() => document.querySelector<HTMLElement>('.page-turn-key[data-turn="ArrowRight"]')?.focus());
    await expect.poll(async () => frontPageName(stack), { timeout: 15_000 }).not.toBe(before);
    await expect(stack).toBeFocused();

    const afterForward = await frontPageName(stack);
    await page.evaluate(() => document.querySelector<HTMLElement>('.page-turn-key[data-turn="ArrowLeft"]')?.focus());
    await expect.poll(async () => frontPageName(stack), { timeout: 15_000 }).not.toBe(afterForward);
    await expect(stack).toBeFocused();
  });

  test('the next-page key is a no-op when no stack has focus', async ({ page }) => {
    await page.goto('/');
    await page.locator('#career').evaluate((node) => (node as HTMLElement).focus());
    const stack = demoStack(page, 'Visrez Animated Loading Logo');
    const before = await frontPageName(stack);
    await page.evaluate(() => document.querySelector<HTMLElement>('.page-turn-key[data-turn="ArrowRight"]')?.focus());
    await page.waitForTimeout(500);
    expect(await frontPageName(stack)).toBe(before);
  });
});
