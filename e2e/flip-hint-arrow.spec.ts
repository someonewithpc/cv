import { expect, test } from '@playwright/test';

import { swipeStack } from './support/paperStack';

/** Per stack: is the hint painted, and does its arrow sit under the dog-ear? */
function hintState(index: number) {
  return async ({ page }: { page: import('@playwright/test').Page }) => page.evaluate((i) => {
    const frame = document.querySelectorAll('.technical-drawing-frame')[i];
    const hint = frame.querySelector<HTMLElement>('.flip-hint')!;
    const fold = frame.querySelector<HTMLElement>('.paper-fold')!;
    const arrow = hint.querySelector('svg')!.getBoundingClientRect();
    const corner = fold.getBoundingClientRect();
    return {
      display: getComputedStyle(hint).display,
      opacity: Number(getComputedStyle(hint).opacity),
      text: hint.textContent!.trim(),
      arrowUnderCorner:
        arrow.left + arrow.width / 2 > corner.left && arrow.left + arrow.width / 2 < corner.right
        && arrow.top > corner.top,
    };
  }, index);
}

test('every untouched stack points a hand-drawn arrow at its dog-ear', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1000);

  const hints = page.locator('.flip-hint');
  await expect(hints).toHaveCount(3);

  for (let i = 0; i < 3; i += 1) {
    const state = await hintState(i)({ page });
    expect(state.display).toBe('flex');
    expect(state.opacity).toBe(1);
    expect(state.text.length).toBeGreaterThan(0);
    expect(state.arrowUnderCorner).toBe(true);
  }

  // Each stack says its own thing rather than repeating the sheet next to it.
  const lines = await hints.allTextContents();
  expect(new Set(lines.map((l) => l.trim())).size).toBe(3);
});

test('turning a page retires that stack hint and leaves the others', async ({ page }) => {
  await page.goto('/');

  const stack = page.locator('article.technical-drawing-stack').nth(1);
  await stack.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await swipeStack(page, stack, true);

  await expect(stack).toHaveAttribute('data-paper-turned', '');
  expect((await hintState(1)({ page })).opacity).toBe(0);
  expect((await hintState(2)({ page })).opacity).toBe(1);
});

test.describe('with JavaScript off', () => {
  test.use({ javaScriptEnabled: false });

  test('the hint stays hidden, since nothing will turn the page', async ({ page }) => {
    await page.goto('/');

    const hints = page.locator('.flip-hint');
    await expect(hints).toHaveCount(3);
    for (const hint of await hints.all()) await expect(hint).toBeHidden();
  });
});
