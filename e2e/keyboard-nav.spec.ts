import { expect, test } from '@playwright/test';

import { RESUME_DELAY_MS } from '../src/client/walkthroughHandover';
import { demoStack, frontPageName } from './support/paperStack';
import { pageWait, test as paced } from './support/timeScale';

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
    // link beside its title.
    await expect(page.locator('#career a.anchor[href="#career"]')).toBeFocused();
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

    // The page-turn buttons answer a click or a keyboard activation of their own now, so unlike
    // the section links above (tabindex="-1", accesskey-only, see the comment above) they stay
    // real Tab stops: a reader who never discovers the accesskey can still reach and use them.
    await expect(page.locator('.page-turn-key[data-turn="ArrowLeft"]')).not.toHaveAttribute('tabindex', '-1');
    await expect(page.locator('.page-turn-key[data-turn="ArrowRight"]')).not.toHaveAttribute('tabindex', '-1');
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

  test('the legend is hidden at rest, shown while the skip link or a page-turn button has focus, and hidden again once focus moves past both', async ({ page }) => {
    await page.goto('/');
    const legend = page.locator('.accesskey-legend');

    await expect(legend).toHaveCSS('opacity', '0');
    // Hidden from find-in-page too: visibility, not just opacity.
    await expect(legend).toHaveCSS('visibility', 'hidden');

    await page.keyboard.press('Tab');
    await expect(page.locator('.skip-link')).toBeFocused();
    await expect(legend).toHaveCSS('opacity', '1');
    await expect(legend).toHaveCSS('visibility', 'visible');

    // The next two Tab stops are the page-turn buttons themselves, real Tab stops now, and the
    // legend stays up through both since it explains what they do.
    await page.keyboard.press('Tab');
    await expect(page.locator('.page-turn-key[data-turn="ArrowLeft"]')).toBeFocused();
    await expect(legend).toHaveCSS('opacity', '1');

    await page.keyboard.press('Tab');
    await expect(page.locator('.page-turn-key[data-turn="ArrowRight"]')).toBeFocused();
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
    // Tab moves focus off the stack and onto the button (it is a real Tab stop now), but
    // Layout.astro remembers the stack as the last one focused, so Enter here still turns it —
    // the same path a real Tab-then-Enter or an Alt+8 accesskey press both reach.
    await page.locator('.page-turn-key[data-turn="ArrowRight"]').focus();
    await page.keyboard.press('Enter');
    await expect.poll(async () => frontPageName(stack), { timeout: 15_000 }).not.toBe(before);
    await expect(stack).toBeFocused();

    const afterForward = await frontPageName(stack);
    await page.locator('.page-turn-key[data-turn="ArrowLeft"]').focus();
    await page.keyboard.press('Enter');
    await expect.poll(async () => frontPageName(stack), { timeout: 15_000 }).not.toBe(afterForward);
    await expect(stack).toBeFocused();
  });

  test('the next-page key is a no-op when no stack has ever had focus', async ({ page }) => {
    await page.goto('/');
    await page.locator('#career').focus();
    const stack = demoStack(page, 'Visrez Animated Loading Logo');
    const before = await frontPageName(stack);
    await page.locator('.page-turn-key[data-turn="ArrowRight"]').focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    expect(await frontPageName(stack)).toBe(before);
  });
});

test.describe('walkthroughs', () => {
  // Page time runs four times faster, so the quiet spell after the walk is a couple of seconds.
  paced.use({ walkthroughRate: 4 });

  paced('a Tab walk across the page takes each walkthrough over once and starts none', async ({ page }) => {
    type Transition = { demo: string; from: string | null; to: string | null };
    await page.addInitScript(() => {
      const w = window as Window & { __transitions?: Transition[] };
      w.__transitions = [];
      const name = (el: Element) =>
        el.closest('article.technical-drawing-stack')?.querySelector('h2.typewriter')?.textContent?.trim() ?? el.className;
      new MutationObserver((records) => {
        for (const record of records) {
          const el = record.target as Element;
          w.__transitions!.push({ demo: name(el), from: record.oldValue, to: el.getAttribute('data-autoplay-state') });
        }
      }).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-autoplay-state'], attributeOldValue: true });
    });
    await page.goto('/');
    // Every stack mounts once it has been in view, so the walk meets each demo's controls.
    for (const stack of await page.locator('article.technical-drawing-stack').all()) {
      await stack.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
    }
    await page.evaluate(() => window.scrollTo(0, 0));

    // To the end of the page: focus wraps to the body once the last stop is behind it.
    for (let i = 0; i < 400; i += 1) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(50);
      if (i > 5 && (await page.evaluate(() => document.activeElement === document.body))) break;
    }
    await pageWait(page, RESUME_DELAY_MS + 2_000);

    const log = await page.evaluate(() => (window as Window & { __transitions?: Transition[] }).__transitions ?? []);
    const after = log.filter((t) => t.from !== null);
    expect(after.filter((t) => t.to === 'playing'), 'walkthroughs that started again').toEqual([]);
    const takeovers = new Map<string, number>();
    for (const t of after) if (t.to === 'user') takeovers.set(t.demo, (takeovers.get(t.demo) ?? 0) + 1);
    for (const [demo, count] of takeovers) expect(count, `${demo} taken over`).toBe(1);
    for (const demo of ['GNU social · Event Dispatch', 'Theme Picker', 'schemaDef → Doctrine Metadata', 'Synthetic Properties']) {
      expect(takeovers.get(demo), `${demo} taken over`).toBe(1);
    }
  });
});
