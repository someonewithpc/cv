import { expect, test } from '@playwright/test';

import { frontPage, frontPageIndex, frontPageName } from './support/paperStack';

/**
 * The resting dog-ear breathes on a loop (fold-reveal-pulse in PaperStack/index.astro), and
 * that loop animates --fold-x/--fold-y, which the front page's crease clip-path reads — so
 * every frame it advances costs a style resolve of that page and the whole demo printed on
 * it. Six stacks doing that at once ate better than half a 60fps frame, for ever, whether or
 * not any of them was being looked at, which is time a page turn on one of them no longer
 * had. fold-drag.ts pauses the pulse while its stack is off screen.
 *
 * Read off the Web Animations API rather than off a class or an attribute, because that is
 * how it is driven: a class or an attribute would put the document's :has() rules back in
 * play on every scroll past, which is the cost this is avoiding in the first place.
 */
async function pulseStates(stack: import('@playwright/test').Locator): Promise<string[]> {
  return stack.evaluate((el) =>
    [...el.querySelectorAll<HTMLElement>('.paper-front')]
      .flatMap((sheet) => sheet.getAnimations())
      .filter((animation) => (animation as CSSAnimation).animationName === 'fold-reveal-pulse')
      .map((animation) => animation.playState));
}

test('the resting dog-ear breathes only on a stack that is on screen', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');

  const stacks = page.locator('article.technical-drawing-stack');
  const first = stacks.first();
  const last = stacks.last();
  await expect(first).toBeVisible();

  await first.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);
  expect(await pulseStates(first)).toEqual(['running']);

  // Far enough down the page that the first stack is nowhere near the viewport.
  await last.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);
  expect(await pulseStates(first)).toEqual(['paused']);
  expect(await pulseStates(last)).toEqual(['running']);

  // Back in view, and the tease picks up where it left off.
  await first.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);
  expect(await pulseStates(first)).toEqual(['running']);
});

test('a page turn leaves the new front page breathing', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');

  const stack = page.locator('article.technical-drawing-stack').first();
  await stack.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);
  const before = await frontPageName(stack);

  await stack.evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press('ArrowRight');
  await expect(stack).toHaveAttribute('data-paper-settled', '', { timeout: 20_000 });
  expect(await frontPageName(stack)).not.toBe(before);

  // The pulse travels with the front-page role, and the stack is in view, so it runs.
  expect(await pulseStates(stack)).toEqual(['running']);
  const front = frontPage(stack, await frontPageIndex(stack));
  await expect(front).toHaveClass(/paper-front/);
});
