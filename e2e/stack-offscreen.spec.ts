import { expect, test, type Locator } from '@playwright/test';

// Chrome and Firefox still ship window.find, which lib.dom dropped as non-standard.
declare global {
  interface Window {
    find(text: string): boolean;
  }
}

/**
 * Stacks well off screen are `content-visibility: auto` (Stack.astro): the browser skips their
 * style, layout and paint, so a resize or a theme switch only lays out the stacks in view. These
 * check that a skipped stack still does what a rendered one does: it keeps its height, it takes
 * focus, find-in-page reaches its text, a link past it lands where it points, and the paper it
 * lays past its own box still paints and takes the pointer.
 */

const drawn = (stack: Locator) =>
  stack.evaluate((el) => el.querySelector('.paper-front')!.checkVisibility({ contentVisibilityAuto: true }));

test('a stack far down the page is skipped until the reader gets near it', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1500);
  const last = page.locator('article.technical-drawing-stack').last();
  expect(await drawn(last), 'the last stack is laid out with the page at the top').toBe(false);

  await last.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await expect.poll(() => drawn(last)).toBe(true);
});

test('a skipped stack keeps the height it has once drawn', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1500);
  const stacks = page.locator('article.technical-drawing-stack');
  const height = (stack: Locator) => stack.evaluate((el) => el.getBoundingClientRect().height);
  const all = await stacks.all();
  const skipped = await Promise.all(all.map(height));
  for (const [index, stack] of all.entries()) {
    await stack.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await expect.poll(() => drawn(stack)).toBe(true);
    expect(await height(stack), `stack ${index}`).toBe(skipped[index]);
  }
});

test('focus reaches a skipped stack and its pages turn', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1500);
  const last = page.locator('article.technical-drawing-stack').last();
  const front = () => last.evaluate((el) => [...el.children].findIndex(
    (child) => (child as HTMLElement).style.getPropertyValue('--page-index').trim() === '1'));

  await last.focus();
  await expect(last).toBeFocused();
  await expect(last).toBeInViewport();
  await expect.poll(() => drawn(last)).toBe(true);

  const was = await front();
  await page.keyboard.press('ArrowRight');
  await expect.poll(front).not.toBe(was);
});

test('find-in-page reaches the text of a skipped stack', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1500);
  const last = page.locator('article.technical-drawing-stack').last();
  const words = await last.evaluate((el) => [...el.querySelectorAll('.paper-front .content *')]
    .filter((node) => node.children.length === 0)
    .map((node) => node.textContent?.trim() ?? '')
    .find((text) => text.length > 12 && !text.includes('\n') && document.body.textContent!.split(text).length === 2));
  expect(words, 'no line of text on the last stack is unique on the page').toBeTruthy();

  expect(await drawn(last)).toBe(false);
  expect(await page.evaluate((text) => window.find(text), words!)).toBe(true);
  expect(await page.evaluate(() => getSelection()?.anchorNode?.parentElement?.closest('article')?.getAttribute('aria-label')))
    .toBe(await last.getAttribute('aria-label'));
  await expect(last).toBeInViewport();
  await expect.poll(() => drawn(last)).toBe(true);
});

test('a link past the stacks lands on its target and stays there', async ({ page }) => {
  await page.goto('/#open-source');
  const target = page.locator('#open-source');
  await expect(target).toBeInViewport();
  const top = () => target.evaluate((el) => Math.round(el.getBoundingClientRect().top));
  const landed = await top();
  await page.waitForTimeout(1500);
  expect(await top()).toBe(landed);
});

for (const width of [1440, 390]) {
  test(`the fanned sheets paint and take the pointer past the stack's box at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.waitForTimeout(1500);
    const stack = page.locator('article.technical-drawing-stack').nth(3);
    await stack.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(500);
    // The sheets behind the front one drop below the stack's bottom edge towards its right-hand
    // corner. A paint clip at the box would cut them off there, and hit testing with them.
    const hit = await stack.evaluate((el) => {
      const box = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(box.right - 40, box.bottom + 2));
    });
    expect(hit, 'the fan below the box is cut off').toBe(true);
  });
}

// The callouts and sheets round the stacks are skipped only while the page is parsed
// (skip-while-parsing in scss/_page-column.scss), and a visit to a fragment parses it whole.
test('a fragment deep in a section lands at the top of the window on a fresh load', async ({ page }) => {
  await page.goto('/#highlight-gnu-social-v3');
  await page.waitForTimeout(1500);
  expect(await page.locator('#highlight-gnu-social-v3').evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBe(0);
  await expect(page.locator('html')).not.toHaveAttribute('data-skip-while-parsing');
});

test('nothing is skipped round the stacks once the page is parsed', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).not.toHaveAttribute('data-skip-while-parsing');
  expect(await page.locator('section.callout').last().evaluate((el) => getComputedStyle(el).contentVisibility)).toBe('visible');
});
