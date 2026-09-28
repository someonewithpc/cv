import { expect, test } from '@playwright/test';

import { dogEarShown } from './support/paperStack';

declare global {
  interface Window {
    __viewTransitions: number;
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

test('a theme pick switches without the wipe', async ({ page }) => {
  await page.addInitScript(() => {
    window.__viewTransitions = 0;
    const startViewTransition = document.startViewTransition?.bind(document);
    if (startViewTransition) {
      document.startViewTransition = (callback) => {
        window.__viewTransitions += 1;
        return startViewTransition(callback);
      };
    }
  });
  await page.goto('/');

  await page.locator('#theme-picker label:has(input[value="dark"])').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).not.toHaveClass(/theme-transition/);
  expect(await page.evaluate(() => window.__viewTransitions)).toBe(0);
});
