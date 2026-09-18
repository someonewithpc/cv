import { expect, type Page, test } from '@playwright/test';

import { swipeStack } from './support/paperStack';

/**
 * Per stack: is the hint painted, does its arrow sit under the dog-ear, and does the sheet
 * count it names belong to this stack? The page grows a demo every few weeks, so nothing
 * here may assume how many stacks there are.
 */
function hintState(page: Page, index: number) {
  return page.evaluate((i) => {
    const frame = document.querySelectorAll('.technical-drawing-frame')[i];
    const hint = frame.querySelector<HTMLElement>('.flip-hint')!;
    const fold = frame.querySelector<HTMLElement>('.paper-fold')!;
    const stack = frame.querySelector<HTMLElement>('[data-paper-stack]')!;
    const arrow = hint.querySelector('svg')!.getBoundingClientRect();
    const corner = fold.getBoundingClientRect();
    const text = hint.textContent!.trim();
    return {
      display: getComputedStyle(hint).display,
      opacity: Number(getComputedStyle(hint).opacity),
      text,
      sheetsNamed: /^(\d+) more sheets/.exec(text)?.[1],
      sheetsUnder: stack.children.length - 1,
      arrowUnderCorner:
        arrow.left + arrow.width / 2 > corner.left && arrow.left + arrow.width / 2 < corner.right
        && arrow.top > corner.top,
    };
  }, index);
}

test('every untouched stack points a hand-drawn arrow at its dog-ear', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1000);

  const stacks = await page.locator('.technical-drawing-frame').count();
  expect(stacks).toBeGreaterThanOrEqual(3);
  await expect(page.locator('.flip-hint')).toHaveCount(stacks);

  for (let i = 0; i < stacks; i += 1) {
    const state = await hintState(page, i);
    expect(state.display, `stack ${i}`).toBe('flex');
    expect(state.opacity, `stack ${i}`).toBe(1);
    expect(state.text, `stack ${i}`).not.toBe('');
    expect(state.arrowUnderCorner, `stack ${i}`).toBe(true);
    // A stack that counts its own sheets has to count its own, not those of the one above.
    if (state.sheetsNamed) expect(Number(state.sheetsNamed), `stack ${i}`).toBe(state.sheetsUnder);
  }
});

test('turning a page retires that stack hint and leaves the others', async ({ page }) => {
  await page.goto('/');

  const stack = page.locator('article.technical-drawing-stack').nth(1);
  await stack.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await swipeStack(page, stack, true);

  await expect(stack).toHaveAttribute('data-paper-turned', '');
  expect((await hintState(page, 1)).opacity).toBe(0);
  expect((await hintState(page, 2)).opacity).toBe(1);
});

test.describe('with JavaScript off', () => {
  test.use({ javaScriptEnabled: false });

  test('the hint stays hidden, since nothing will turn the page', async ({ page }) => {
    await page.goto('/');

    const hints = page.locator('.flip-hint');
    await expect(hints).toHaveCount(await page.locator('.technical-drawing-frame').count());
    for (const hint of await hints.all()) await expect(hint).toBeHidden();
  });
});
