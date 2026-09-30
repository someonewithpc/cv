import { expect, test } from '@playwright/test';

import { demoStack, dogEarShown, frontPage, frontPageIndex } from './support/paperStack';

declare global {
  interface Window {
    __viewTransitions: number;
    __themeClips: number;
  }
}

test.use({ reducedMotion: 'reduce' });

test('the dog-ear rests without its pulse', async ({ page }) => {
  await page.goto('/');
  const stack = page.locator('article.technical-drawing-stack').first();
  await stack.scrollIntoViewIfNeeded();
  await dogEarShown(stack);
  // Past the pulse's 1.5s delay, so a pulse that was going to start has started
  await page.waitForTimeout(2000);

  const pulses = await stack.evaluate((el) =>
    el.getAnimations({ subtree: true })
      .filter((animation) => (animation as CSSAnimation).animationName?.startsWith('fold-pulse-')).length);
  expect(pulses).toBe(0);
});

test('a theme pick fades in, without the wipe', async ({ page }) => {
  await page.addInitScript(() => {
    window.__viewTransitions = 0;
    window.__themeClips = 0;
    const startViewTransition = document.startViewTransition?.bind(document);
    if (startViewTransition) {
      document.startViewTransition = (callback) => {
        window.__viewTransitions += 1;
        return startViewTransition(callback);
      };
    }
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      if (typeof options === 'object' && options.pseudoElement?.startsWith('::view-transition')) window.__themeClips += 1;
      return animate.call(this, keyframes, options);
    };
  });
  await page.goto('/');

  await page.locator('#theme-picker label:has(input[value="dark"])').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const fades = await page.evaluate(() => document.getAnimations()
    .filter((animation) => (animation as CSSAnimation).animationName === 'theme-fade-in').length);
  expect(fades).toBe(1);
  await expect(page.locator('html')).not.toHaveClass(/theme-transition/);
  expect(await page.evaluate(() => [window.__viewTransitions, window.__themeClips])).toEqual([1, 0]);
});

test('a demo waits paused, plays at full motion on play, and pause puts it back', async ({ page }) => {
  await page.goto('/');
  const stack = page.locator('article.technical-drawing-stack').filter({
    has: page.locator('h2.typewriter', { hasText: 'GNU social · Event Dispatch' }),
  });
  await stack.scrollIntoViewIfNeeded();
  const sheet = frontPage(stack, await frontPageIndex(stack));
  const bus = sheet.locator('.event-bus[data-live]');
  await expect(bus).toHaveAttribute('data-ready', 'true', { timeout: 15_000 });
  const deck = sheet.locator('[data-demo-transport]');
  // The deck sits on the sheet itself, the element that carries data-full-motion.
  const drawing = deck.locator('xpath=..');
  const key = (name: string) => deck.locator(`[data-demo-key="${name}"]`);

  await expect(bus).toHaveAttribute('data-autoplay-state', 'paused');
  await expect(deck).toHaveAttribute('data-state', 'paused');
  await expect(deck).toContainText('MOTION PAUSED');
  await expect(key('play')).toBeEnabled();
  await expect(sheet.locator('.event-bus-cursor')).toBeHidden();

  await key('play').click();
  await expect(drawing).toHaveAttribute('data-full-motion', '');
  await expect(bus).toHaveAttribute('data-autoplay-state', 'playing');
  await expect(deck).toContainText('AUTO PLAYING');
  // Full motion: the cursor glides from control to control on a timed animation.
  const cursor = sheet.locator('.event-bus-cursor');
  await expect(cursor).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => cursor.evaluate((el) => el.getAnimations()
    .filter((animation) => Number(animation.effect?.getComputedTiming().duration) > 100).length), { timeout: 15_000 })
    .toBeGreaterThan(0);

  await key('pause').click();
  await expect(bus).toHaveAttribute('data-autoplay-state', 'paused');
  await expect(deck).toHaveAttribute('data-state', 'paused');
  await expect(drawing).not.toHaveAttribute('data-full-motion');
});

// The two sheets whose artwork holds still at every setting: nothing on them to play.
const NO_DECK = ['web-ts-mode', 'Paper Stack'];

test('every demo sheet shows its deck paused, with its keys in reach', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  const stacks = page.locator('article.technical-drawing-stack');
  const titles = await stacks.evaluateAll((all) => all.map((stack) => stack.getAttribute('aria-label') ?? ''));
  for (const title of titles) {
    await test.step(title, async () => {
      const stack = demoStack(page, title);
      await stack.scrollIntoViewIfNeeded();
      const deck = frontPage(stack, await frontPageIndex(stack)).locator('[data-demo-transport]');
      if (NO_DECK.includes(title)) {
        await expect(deck).toBeHidden();
        return;
      }
      await expect(deck).toBeVisible({ timeout: 15_000 });
      await expect(deck).toHaveAttribute('data-state', 'paused');
      await expect(deck).toContainText('MOTION PAUSED');
      for (const key of ['play', 'pause', 'reset']) {
        await expect(deck.locator(`[data-demo-key="${key}"]`)).toBeVisible();
        await expect(deck.locator(`[data-demo-key="${key}"]`)).toBeEnabled();
      }
    });
  }
});

test('a sheet that only animates plays on request and pause stills it', async ({ page }) => {
  await page.goto('/');
  const stack = demoStack(page, 'Visrez Animated Loading Logo');
  await stack.scrollIntoViewIfNeeded();
  const sheet = frontPage(stack, await frontPageIndex(stack)).locator(':scope > section');
  const deck = sheet.locator('[data-demo-transport]');
  const logoAnimations = () => sheet.locator('.content svg path').evaluateAll((paths) =>
    paths.flatMap((path) => path.getAnimations()).filter((animation) => animation.playState === 'running').length);

  await expect(deck).toBeVisible();
  await expect(deck).toContainText('MOTION PAUSED');
  expect(await logoAnimations()).toBe(0);

  await deck.locator('[data-demo-key="play"]').click();
  await expect(sheet).toHaveAttribute('data-full-motion', '');
  await expect(deck).toContainText('PLAYING');
  await expect.poll(logoAnimations).toBeGreaterThan(0);

  await deck.locator('[data-demo-key="pause"]').click();
  await expect(deck).toHaveAttribute('data-state', 'paused');
  await expect(sheet).not.toHaveAttribute('data-full-motion');
  await expect.poll(logoAnimations).toBe(0);
});

test.describe('with full motion', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('a sheet that only animates plays by itself and shows no deck', async ({ page }) => {
    await page.goto('/');
    const stack = demoStack(page, 'Visrez Animated Loading Logo');
    await stack.scrollIntoViewIfNeeded();
    const sheet = frontPage(stack, await frontPageIndex(stack));
    await expect(sheet.locator('.content svg path').first()).toBeVisible();
    await expect(sheet.locator('[data-demo-transport]')).toBeHidden();
  });
});
