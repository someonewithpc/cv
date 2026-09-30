import { expect, test, type Locator, type Page } from '@playwright/test';

import { demoStack, frontPageName } from './support/paperStack';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

type TurnRecord = { pressed: number, committed: number, last: number };

/**
 * When the turn commits and when it stops moving, both counted from the key press. A committed
 * flip renumbers every page wrapper's `--page-index` (fold-drag.ts's restack), so the first
 * style write that moves the front page along is the commit; the last style write on any
 * wrapper is the glide finishing. `commit` is Infinity when nothing turns at all.
 */
async function turnTiming(page: Page, stack: Locator, key: string): Promise<{ commit: number, done: number }> {
  // Recorded in the page and read back afterwards, not awaited as a promise from evaluate():
  // a pending evaluate() holds up every later call on the page, including the key press it is
  // waiting for.
  await stack.evaluate((el) => {
    const front = () => [...el.children].findIndex(
      (child) => (child as HTMLElement).style.getPropertyValue('--page-index').trim() === '1');
    const was = front();
    const record: TurnRecord = { pressed: 0, committed: 0, last: 0 };
    (window as Window & { paperTurn?: TurnRecord }).paperTurn = record;
    el.addEventListener('keydown', () => { record.pressed = performance.now(); }, { capture: true, once: true });
    const observer = new MutationObserver(() => {
      if (record.pressed === 0) return;
      record.last = performance.now();
      if (record.committed === 0 && front() !== was) record.committed = record.last;
    });
    for (const child of el.children) observer.observe(child, { attributes: true, attributeFilter: ['style'] });
  });
  await stack.focus();
  await page.keyboard.press(key);
  // Comfortably past the end of the turn, so `last` is the glide finishing and not the wait.
  await page.waitForTimeout(2500);
  return page.evaluate(() => {
    const record = (window as Window & { paperTurn?: TurnRecord }).paperTurn!;
    return {
      commit: record.committed === 0 ? Infinity : record.committed - record.pressed,
      done: record.last - record.pressed,
    };
  });
}

test('marker editor: an arrow key commits the turn without waiting', async ({ page }) => {
  const stack = demoStack(page, 'Interactive Map Marker Editor');
  await stack.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  // A key press has no hand still on the paper, so the flip commits on the spot and one glide
  // plays the turn out. Easing a swipe's worth of travel in first, then releasing at the end of
  // it, held the forward commit back about 1.5s. The turn ending matters as much as the commit:
  // the page coming back used to commit early and then halt half way through, on the seam
  // between two glides, taking about 2s to arrive.
  const away = await turnTiming(page, stack, 'ArrowRight');
  expect(away.commit).toBeLessThan(900);
  expect(away.done).toBeLessThan(2000);
  expect(await frontPageName(stack)).toBe('Marker Selector');

  const back = await turnTiming(page, stack, 'ArrowLeft');
  expect(back.commit).toBeLessThan(900);
  expect(back.done).toBeLessThan(2000);
  expect(await frontPageName(stack)).toBe('Interactive Map Marker Editor');
});

test('a key turn reads the dog-ear off the screen once', async ({ page }) => {
  // currentFoldSize is the one caller that asks for the clip's ::after style (the pulse's scale).
  // The grab needs that read; the flip after it starts from the size the grab's first move wrote.
  await page.addInitScript(() => {
    const read = window.getComputedStyle;
    const w = window as Window & { foldReads?: number };
    w.foldReads = 0;
    window.getComputedStyle = (el, pseudo) => {
      if (pseudo === '::after' && el.classList.contains('paper-clip')) w.foldReads!++;
      return read(el, pseudo);
    };
  });
  await page.reload();
  const stack = demoStack(page, 'Interactive Map Marker Editor');
  await stack.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await turnTiming(page, stack, 'ArrowRight');
  expect(await frontPageName(stack)).toBe('Marker Selector');
  expect(await page.evaluate(() => (window as Window & { foldReads?: number }).foldReads)).toBe(1);
});

test('a settled turn writes the front sheet to the status beside the stack', async ({ page }) => {
  const stack = demoStack(page, 'Interactive Map Marker Editor');
  await stack.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  const status = stack.locator('xpath=following-sibling::*[1][@role="status"]');
  // Nothing on load: the page at the front is where the reader started.
  await expect(status).toHaveText('');

  const pages = await stack.evaluate((el) => el.childElementCount);
  await turnTiming(page, stack, 'ArrowRight');
  await expect(status).toHaveText(`Sheet 2 of ${pages}: Marker Selector`);

  await turnTiming(page, stack, 'ArrowLeft');
  await expect(status).toHaveText(`Sheet 1 of ${pages}: Interactive Map Marker Editor`);
});
