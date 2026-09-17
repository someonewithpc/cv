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

  // Watch from inside the page. A flip renumbers --page-index halfway through and only hands the
  // flap over at the very end, so what matters is the paper: from the renumber on, the page at
  // the front must have a flap of its own, and it must be drawn well before the flip lands.
  // The flap's width is --fold-x, so its painted size measures the reveal too.
  const watch = stack.evaluate((el) => new Promise<{
    bareFrames: number, drawnAfter: number, landing: boolean, flapCount: number,
  }>((resolve, reject) => {
    const pages = [...el.children] as HTMLElement[];
    const frontPage = () => pages.find((p) => p.style.getPropertyValue('--page-index').trim() === '1')!;
    const started = frontPage();
    const deadline = performance.now() + 10_000;
    let restacked = 0;
    let bareFrames = 0;
    const tick = () => {
      const front = frontPage();
      if (!restacked && front !== started) restacked = performance.now();
      if (restacked) {
        const flap = front.querySelector<HTMLElement>('.paper-fold');
        if (!flap) bareFrames += 1;
        // 2cm is the resting dog-ear, so a fifth of that is unmistakably paper, not a hairline
        if (flap && flap.getBoundingClientRect().width > 20) {
          resolve({
            bareFrames,
            drawnAfter: performance.now() - restacked,
            landing: !!el.querySelector('.paper-fold--active'),
            flapCount: el.querySelectorAll('.paper-fold').length,
          });
          return;
        }
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

  expect(seen.bareFrames, 'frames where the front page had no flap at all').toBe(0);
  expect(seen.drawnAfter, 'ms from the renumber to a drawn dog-ear').toBeLessThan(400);
  expect(seen.landing, 'the flipped sheet is still folding away').toBe(true);
  // One flap is the real one finishing the flip, the other the stand-in holding the new front
  // page's dog-ear until it is free.
  expect(seen.flapCount).toBe(2);

  // And the stand-in gives way rather than piling up.
  await page.waitForTimeout(2500);
  expect(await stack.locator('.paper-fold').count()).toBe(1);
  expect(await stack.locator('.paper-fold--stand-in').count()).toBe(0);
});
