import { expect, test, type Locator } from '@playwright/test';

/**
 * A stack's dog-ear draws itself once (initial-fold-reveal in PaperStack/index.astro) and then
 * breathes (the fold pulse). Both used to start at load, so on a stack further down the page
 * they had played out long before anyone scrolled to it. They now wait until the stack's
 * bottom edge, where the dog-ear is, comes on screen (watchStackReveal in fold-drag.ts).
 */
async function foldState(stack: Locator): Promise<{ reveal: string, pulses: string[], flap: number }> {
  return stack.evaluate((el) => {
    const front = el.querySelector<HTMLElement>('.paper-front')!;
    const animations = front.getAnimations({ subtree: true }) as CSSAnimation[];
    const reveal = animations.find((animation) => animation.animationName === 'initial-fold-reveal');
    return {
      reveal: reveal ? `${reveal.playState} at ${Math.round(Number(reveal.currentTime))}` : 'none',
      pulses: animations
        .filter((animation) => animation.animationName?.startsWith('fold-pulse-'))
        .map((animation) => animation.playState),
      flap: front.querySelector<HTMLElement>(':scope > .paper-fold')!.getBoundingClientRect().width,
    };
  });
}

/** Scrolls so the stack's bottom edge sits `below` px under the bottom of the window. */
async function bottomEdgeBelowWindow(stack: Locator, below: number): Promise<void> {
  await stack.evaluate((el, below) => {
    const bottom = el.getBoundingClientRect().bottom + window.scrollY;
    window.scrollTo({ top: bottom - window.innerHeight - below, behavior: 'instant' });
  }, below);
}

test('a stack far down the page reveals its dog-ear only once its corner is on screen', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  const stack = page.locator('article.technical-drawing-stack').last();

  // Long past the half second the reveal waits and the half second it runs.
  await page.waitForTimeout(2500);
  const waiting = await foldState(stack);
  expect(waiting.reveal).toBe('paused at 0');
  expect(waiting.pulses).toEqual(['paused', 'paused', 'paused']);
  // Only the flap's 1px border on each side: the fold is still 0 by 0.
  expect(waiting.flap).toBeLessThan(3);

  // Most of the stack in view, but not the corner the dog-ear is in.
  await bottomEdgeBelowWindow(stack, 120);
  await page.waitForTimeout(1500);
  expect((await foldState(stack)).reveal).toBe('paused at 0');

  await bottomEdgeBelowWindow(stack, -40);
  await expect.poll(async () => (await foldState(stack)).reveal, { timeout: 5_000 }).toBe('finished at 1000');
  const shown = await foldState(stack);
  expect(shown.pulses).toEqual(['running', 'running', 'running']);
  // 2cm across at rest.
  expect(shown.flap).toBeGreaterThan(70);
});
