import { expect, test } from '@playwright/test';

import { frontPageIndex, frontPageName, swipeStack } from './support/paperStack';

const DEMOS = [
  {
    label: 'Visrez logo animation',
    stackIndex: 0,
    pages: [
      'Visrez Animated Loading Logo',
      'Original Logo',
      'Cube :)',
      'Authored Path',
      'Path Data',
      'Putting it all together',
    ],
  },
  {
    label: 'Marker editor',
    stackIndex: 1,
    pages: [
      'Interactive Map Marker Editor',
      'Marker Selector',
      'Marker Editor',
      'Preview Background',
      'Composable Parts',
      'Undoable Store',
    ],
  },
  {
    label: 'Space builder',
    stackIndex: 2,
    pages: [
      'Space Builder · Add Tool',
      'Place Area',
      'Edit Parameters',
      'Layout Styles',
      'Capacity Badge',
      'Drag & Drop',
    ],
  },
];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

for (const demo of DEMOS) {
  test(`${demo.label}: forward swipes visit every page in order, then wrap`, async ({ page }) => {
    const stack = page.locator('article.technical-drawing-stack').nth(demo.stackIndex);
    await stack.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    expect(await stack.locator(':scope > div').count()).toBe(demo.pages.length);
    expect(await frontPageIndex(stack)).toBe(0);
    expect(await frontPageName(stack)).toBe(demo.pages[0]);

    for (let i = 1; i < demo.pages.length; i += 1) {
      await swipeStack(page, stack, true);
      expect(await frontPageName(stack), `page ${i} after ${i} forward swipe(s)`).toBe(demo.pages[i]);
    }

    // One more forward swipe past the last page wraps back to the first.
    await swipeStack(page, stack, true);
    expect(await frontPageName(stack)).toBe(demo.pages[0]);
  });
}

test('marker editor: backward swipe is clamped at the first page', async ({ page }) => {
  const stack = page.locator('article.technical-drawing-stack').nth(1);
  await stack.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  expect(await frontPageName(stack)).toBe('Interactive Map Marker Editor');

  // Nothing behind the front page — a backward swipe here is a no-op, not a wrap.
  await swipeStack(page, stack, false);
  expect(await frontPageName(stack)).toBe('Interactive Map Marker Editor');
  await swipeStack(page, stack, false);
  expect(await frontPageName(stack)).toBe('Interactive Map Marker Editor');
});

test('visrez logo: the dog-ear repaints when the theme changes', async ({ page }) => {
  const stack = page.locator('article.technical-drawing-stack').first();
  await stack.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  // The flap paints the back of the sheet in the page's own colour, lifted off it by JS, so a
  // theme switch has to be picked up there as well as in the stylesheet.
  for (const theme of ['dark', 'arctic', 'dark-forest', 'light']) {
    await page.locator(`#theme-picker input[value="${theme}"]`).click({ force: true });
    // The picker writes data-theme back once its view transition has finished
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

    const paint = await stack.evaluate((el) => {
      const fold = el.querySelector<HTMLElement>('.paper-fold')!;
      const sheet = fold.parentElement!;
      const section = sheet.querySelector<HTMLElement>(
        ':scope > :not(.paper-fold, .paper-back-grab, .paper-clip, .paper-clip-under, .paper-flip-hint)',
      )!;
      return { fold: getComputedStyle(fold).backgroundColor, page: getComputedStyle(section).backgroundColor };
    });
    expect(paint.fold, `dog-ear under the ${theme} theme`).toBe(paint.page);
  }
});

test('marker editor: a forward swipe then a backward swipe returns to the start', async ({ page }) => {
  const stack = page.locator('article.technical-drawing-stack').nth(1);
  await stack.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  await swipeStack(page, stack, true);
  expect(await frontPageName(stack)).toBe('Marker Selector');

  await swipeStack(page, stack, false);
  expect(await frontPageName(stack)).toBe('Interactive Map Marker Editor');
});

test('visrez logo: the dog-ear is drawn while the flip is still landing', async ({ page }) => {
  const stack = page.locator('article.technical-drawing-stack').first();
  await stack.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  // Watch from inside the page: the flip renumbers --page-index halfway through, and the new
  // front page has to grow its dog-ear from there rather than after everything has stopped.
  const watch = stack.evaluate((el) => new Promise<{ after: number, landing: boolean }>((resolve, reject) => {
    const pages = [...el.children] as HTMLElement[];
    const fold = el.querySelector<HTMLElement>('.paper-fold')!;
    const frontPage = () => pages.find((p) => p.style.getPropertyValue('--page-index').trim() === '1')!;
    const started = frontPage();
    const deadline = performance.now() + 10_000;
    let restacked = 0;
    const tick = () => {
      const front = frontPage();
      if (!restacked && front !== started) restacked = performance.now();
      if (restacked && parseFloat(getComputedStyle(front).getPropertyValue('--fold-x')) > 0) {
        resolve({ after: performance.now() - restacked, landing: fold.classList.contains('paper-fold--active') });
        return;
      }
      if (performance.now() > deadline) {
        reject(new Error(restacked ? 'the dog-ear never came back' : 'the stack never turned a page'));
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));

  await stack.focus();
  await page.keyboard.press('ArrowRight');
  const seen = await watch;

  // Half a second was the reveal delay the flip used to restart; anything near it is the bug back.
  expect(seen.after).toBeLessThan(300);
  expect(seen.landing, 'the flipped sheet is still folding away').toBe(true);
});
