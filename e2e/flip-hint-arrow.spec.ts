import { expect, type Page, test } from '@playwright/test';

import { swipeStack } from './support/paperStack';

/**
 * Per frame: which of the five drawings is on screen, whether the way-out and the way-back
 * hints are painted, and whether the drawing sits on the dog-ear. The page grows a demo every
 * few weeks, so nothing here may assume how many stacks there are.
 */
function hintState(page: Page, index: number) {
  return page.evaluate((i) => {
    const frame = document.querySelectorAll('.technical-drawing-frame')[i];
    const hints = frame.querySelector<HTMLElement>('.flip-hints')!;
    const shown = [...frame.querySelectorAll<HTMLElement>('.hint-variant')]
      .filter((v) => getComputedStyle(v).display !== 'none');
    const painted = (hint: HTMLElement | null | undefined) =>
      Boolean(hint) && Number(getComputedStyle(hint!).opacity) > 0.5;
    const fwd = shown[0]?.querySelector<HTMLElement>('.flip-hint--fwd');
    const back = shown[0]?.querySelector<HTMLElement>('.flip-hint--back');
    const drawing = fwd?.matches('svg') ? fwd : fwd?.querySelector('svg');
    const corner = frame.querySelector('.paper-fold')!.getBoundingClientRect();
    const box = drawing?.getBoundingClientRect();
    return {
      armed: getComputedStyle(hints).display !== 'none',
      variants: shown.map((v) => v.dataset.variant),
      fwdPainted: painted(fwd),
      backPainted: painted(back),
      text: shown[0]?.textContent?.trim() ?? '',
      drawingOnCorner: Boolean(box)
        && box!.left + box!.width / 2 > corner.left && box!.left + box!.width / 2 < corner.right
        && box!.bottom > corner.top,
    };
  }, index);
}

const frameCount = (page: Page) => page.locator('.technical-drawing-frame').count();

test('the top stack alone points a drawing at its dog-ear', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1000);

  const frames = await frameCount(page);
  expect(frames).toBeGreaterThanOrEqual(3);

  const top = await hintState(page, 0);
  expect(top.armed).toBe(true);
  expect(top.variants).toEqual(['1']);
  expect(top.fwdPainted).toBe(true);
  expect(top.backPainted).toBe(false);
  expect(top.text).not.toBe('');
  expect(top.drawingOnCorner).toBe(true);

  for (let i = 1; i < frames; i += 1) {
    expect((await hintState(page, i)).armed, `stack ${i}`).toBe(false);
  }
});

test('all=1 hands the same drawing to every stack', async ({ page }) => {
  await page.goto('/?hint=1&all=1');
  await page.waitForTimeout(1000);

  for (let i = 0; i < await frameCount(page); i += 1) {
    const state = await hintState(page, i);
    expect(state.armed, `stack ${i}`).toBe(true);
    expect(state.fwdPainted, `stack ${i}`).toBe(true);
    expect(state.drawingOnCorner, `stack ${i}`).toBe(true);
  }
});

test('hint=1 to hint=5 each pick their own drawing, anything else falls back to the first', async ({ page }) => {
  for (const variant of ['1', '2', '3', '4', '5']) {
    await page.goto(`/?hint=${variant}`);
    await page.waitForTimeout(800);
    const state = await hintState(page, 0);
    expect(state.variants, `hint=${variant}`).toEqual([variant]);
    expect(state.fwdPainted, `hint=${variant}`).toBe(true);
    expect(state.drawingOnCorner, `hint=${variant}`).toBe(true);
  }

  for (const junk of ['0', '9', 'banana']) {
    await page.goto(`/?hint=${junk}`);
    await page.waitForTimeout(800);
    expect((await hintState(page, 0)).variants, `hint=${junk}`).toEqual(['1']);
  }
});

test('a turn swaps the way out for the way back, and coming back retires both', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(800);

  const stack = page.locator('article.technical-drawing-stack').first();
  await stack.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  await swipeStack(page, stack, true);
  await expect(stack).toHaveAttribute('data-paper-turned', '');
  const turned = await hintState(page, 0);
  expect(turned.fwdPainted).toBe(false);
  expect(turned.backPainted).toBe(true);

  await swipeStack(page, stack, false);
  await expect(stack).toHaveAttribute('data-paper-returned', '');
  const returned = await hintState(page, 0);
  expect(returned.fwdPainted).toBe(false);
  expect(returned.backPainted).toBe(false);
});

test.describe('with JavaScript off', () => {
  test.use({ javaScriptEnabled: false });

  test('no hint is painted, since nothing will turn the page', async ({ page }) => {
    await page.goto('/');

    const hints = page.locator('.flip-hints');
    await expect(hints).toHaveCount(await frameCount(page));
    for (const hint of await hints.all()) await expect(hint).toBeHidden();
  });
});
