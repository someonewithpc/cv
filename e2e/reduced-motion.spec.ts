import { expect, test } from '@playwright/test';

import { dogEarShown, frontPage, frontPageIndex } from './support/paperStack';

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
