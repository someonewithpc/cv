import { expect, test, type Locator, type Page } from '@playwright/test';

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

/**
 * How long after the key press the flip commits. A committed flip renumbers every page
 * wrapper's `--page-index` (fold-drag.ts's restack), so the first style write that moves the
 * front page along is the commit. Infinity when nothing turns within five seconds.
 */
type TurnRecord = { pressed: number, committed: number };

async function turnDelay(page: Page, stack: Locator, key: string): Promise<number> {
  // Recorded in the page and read back afterwards, not awaited as a promise from evaluate():
  // a pending evaluate() holds up every later call on the page, including the key press it is
  // waiting for.
  await stack.evaluate((el) => {
    const front = () => [...el.children].findIndex(
      (child) => (child as HTMLElement).style.getPropertyValue('--page-index').trim() === '1');
    const was = front();
    const record: TurnRecord = { pressed: 0, committed: 0 };
    (window as Window & { paperTurn?: TurnRecord }).paperTurn = record;
    el.addEventListener('keydown', () => { record.pressed = performance.now(); }, { capture: true, once: true });
    const observer = new MutationObserver(() => {
      if (record.pressed === 0 || record.committed !== 0 || front() === was) return;
      record.committed = performance.now();
      observer.disconnect();
    });
    for (const child of el.children) observer.observe(child, { attributes: true, attributeFilter: ['style'] });
  });
  await stack.focus();
  await page.keyboard.press(key);
  // Long enough for the flip's own glide to finish, so the next gesture starts from rest.
  await page.waitForTimeout(2500);
  return page.evaluate(() => {
    const record = (window as Window & { paperTurn?: TurnRecord }).paperTurn!;
    return record.committed === 0 ? Infinity : record.committed - record.pressed;
  });
}

test('marker editor: an arrow key commits the turn without waiting', async ({ page }) => {
  const stack = page.locator('article.technical-drawing-stack').nth(1);
  await stack.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  // A key press has no hand still on the paper, so the flip commits on the spot and its own
  // glide plays the turn out. Easing a swipe's worth of travel in first, then releasing at the
  // end of it, held the commit back about 1.5s.
  expect(await turnDelay(page, stack, 'ArrowRight')).toBeLessThan(900);
  expect(await frontPageName(stack)).toBe('Marker Selector');

  expect(await turnDelay(page, stack, 'ArrowLeft')).toBeLessThan(1200);
  expect(await frontPageName(stack)).toBe('Interactive Map Marker Editor');
});

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

test('marker editor: a forward swipe then a backward swipe returns to the start', async ({ page }) => {
  const stack = page.locator('article.technical-drawing-stack').nth(1);
  await stack.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  await swipeStack(page, stack, true);
  expect(await frontPageName(stack)).toBe('Marker Selector');

  await swipeStack(page, stack, false);
  expect(await frontPageName(stack)).toBe('Interactive Map Marker Editor');
});
