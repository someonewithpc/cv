import { expect, test, type Locator, type Page } from '@playwright/test';

import { frontPageName } from './support/paperStack';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

type TurnRecord = { pressed: number, committed: number };

/**
 * How long after the key press the flip commits. A committed flip renumbers every page
 * wrapper's `--page-index` (fold-drag.ts's restack), so the first style write that moves the
 * front page along is the commit. Infinity when nothing turns within the wait below.
 */
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
