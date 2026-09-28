import { expect, test } from '@playwright/test';

import { demoStack, frontPageName } from './support/paperStack';

test.describe('skip link', () => {
  test('moves focus to the Career section, not back to the top, and the next Tab lands inside it', async ({ page }) => {
    await page.goto('/');

    await page.keyboard.press('Tab');
    await expect(page.locator('.skip-link')).toBeFocused();

    await page.keyboard.press('Enter');
    // The native anchor jump plus the tabindex="-1" focus move both land in the same task; give
    // the browser one to settle before reading document.activeElement. #career, not #main:
    // #main starts right where the reader already was (no visible change), so the skip link
    // targets the first section with real content instead.
    await expect(page.locator('#career')).toBeFocused();

    await page.keyboard.press('Tab');
    // The theme picker (also in the DOM before #career, but a Tab stop of its own) and every
    // section start (tabindex="-1") are accesskey landing spots, not sequential Tab stops, so
    // the next real stop after the skip link is the first focusable control inside Career: the
    // "Demos" link in the first job entry's "See" line. Career's own end-of-section refs list
    // links to #demos too, later in the DOM, hence .first() rather than a role/name match.
    await expect(page.locator('#career a[href="#demos"]').first()).toBeFocused();
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

  test('every accesskey is a letter, unique, and on the element the legend says', async ({ page }) => {
    await page.goto('/');

    const targets: Record<string, { locator: () => ReturnType<typeof page.locator>, focusable: boolean }> = {
      s: { locator: () => page.locator('.skip-link'), focusable: true },
      t: { locator: () => page.locator('#theme-picker'), focusable: true },
      h: { locator: () => page.locator('.accesskey-legend a[href="#profile"]'), focusable: true },
      c: { locator: () => page.locator('.accesskey-legend a[href="#career"]'), focusable: true },
      b: { locator: () => page.locator('.accesskey-legend a[href="#bill-of-materials"]'), focusable: true },
      m: { locator: () => page.locator('.accesskey-legend a[href="#demos"]'), focusable: true },
      o: { locator: () => page.locator('.accesskey-legend a[href="#open-source"]'), focusable: true },
      p: { locator: () => page.locator('.page-turn-key[data-turn="ArrowLeft"]'), focusable: false },
      n: { locator: () => page.locator('.page-turn-key[data-turn="ArrowRight"]'), focusable: false },
    };

    const all = await page.locator('[accesskey]').evaluateAll((els) => els.map((el) => el.getAttribute('accesskey')));
    expect(all.sort()).toEqual(['b', 'c', 'h', 'm', 'n', 'o', 'p', 's', 't']);
    for (const key of all) expect(key).toMatch(/^[a-z]$/);

    for (const [key, { locator }] of Object.entries(targets)) {
      await expect(locator()).toHaveAttribute('accesskey', key);
    }
  });

  test('the legend shows the modifier for the reader\'s browser and platform', async ({ page }) => {
    // Chrome cannot be told to report itself as Firefox or a Mac, so this stubs
    // navigator.userAgent/platform before Layout.astro's script runs, the same values its UA
    // check reads, to exercise the Firefox and Mac branches this box's real browser never hits.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0',
        configurable: true,
      });
    });
    await page.goto('/');
    await expect(page.locator('.ak-mod')).toHaveText('Alt+Shift');
  });

  test('the legend shows Ctrl+Alt on a Mac, regardless of browser', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true });
    });
    await page.goto('/');
    await expect(page.locator('.ak-mod')).toHaveText('Ctrl+Alt');
  });

  test('the legend lists all nine keys and their targets, with the real modifier', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.ak-mod')).toHaveText('Alt');

    const items = await page.locator('.accesskey-legend li').allTextContents();
    expect(items).toHaveLength(9);
    expect(items[0]).toContain('Skip to content');
    expect(items[1]).toContain('Theme picker');
    expect(items[2]).toContain('Top of the page');
    expect(items[7]).toContain('Previous page');
    expect(items[8]).toContain('Next page');
    for (const [index, key] of ['S', 'T', 'H', 'C', 'B', 'M', 'O', 'P', 'N'].entries()) {
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

  for (const [width, height] of [[1440, 900], [390, 844]]) {
    test(`each section key puts its section's top at the top of the viewport and focuses it, at ${width}px`, async ({ page }) => {
      // An access key on a section would focus it, and focus() centres anything taller than the
      // viewport: Alt+O left the reader mid-sheet on a torn edge. The keys are links now, so a
      // real press focuses the link and follows it; focus() then click() is that same sequence.
      await page.setViewportSize({ width, height });
      await page.goto('/');
      for (const id of ['profile', 'career', 'bill-of-materials', 'demos', 'open-source']) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.keyboard.press('Tab');
        await page.locator(`.accesskey-legend a[href="#${id}"]`).evaluate((link) => {
          (link as HTMLElement).focus();
          (link as HTMLElement).click();
        });
        const section = page.locator(`#${id}`);
        await expect(section).toBeFocused();
        await expect.poll(async () => section.evaluate((el) => Math.abs(el.getBoundingClientRect().top))).toBeLessThan(1);
      }
    });
  }

  test('the profile, the theme picker and each section take a visible ring when their accesskey target is focused', async ({ page }) => {
    await page.goto('/');
    for (const id of ['profile', 'theme-picker', 'career', 'bill-of-materials', 'demos', 'open-source']) {
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
