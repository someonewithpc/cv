import { expect, type Locator, type Page } from '@playwright/test';

import { pageWait } from './timeScale';

/**
 * Where a demo's transport deck sits, measured against the sheet it is drawn on. In the
 * callout's card the deck is measured against the sheet it came off.
 */
export function deckPlacement(deck: Locator) {
  return deck.evaluate((el) => {
    const inCard = el.parentElement!.matches('.callout-card');
    const section = inCard
      ? el.closest('section.callout')!.querySelector('article.technical-drawing-stack > * > section')!
      : el.closest('section')!;
    const sheet = section.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    const band = parseFloat(getComputedStyle(section).paddingBottom);
    const clearOf = (other: Element | null) => {
      if (!other) return false;
      const b = other.getBoundingClientRect();
      return box.right <= b.left + 1 || box.left >= b.right - 1
        || box.bottom <= b.top + 1 || box.top >= b.bottom - 1;
    };
    return {
      inCard,
      insideSheet: box.left >= sheet.left - 1 && box.right <= sheet.right + 1
        && box.top >= sheet.top - 1 && box.bottom <= sheet.bottom + 1,
      insideBand: box.top >= sheet.bottom - band - 1 && box.bottom <= sheet.bottom + 1,
      clearOfDrawing: clearOf(section.querySelector('.content')),
      clearOfTitleBlock: clearOf(section.querySelector('table')),
    };
  });
}

/** Hovering the sheet is the takeover the deck's hint promises. */
export async function hoverTakeover(page: Page, stack: Locator, deck: Locator): Promise<void> {
  const box = (await stack.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.6);
  await page.mouse.move(box.x + box.width * 0.42, box.y + box.height * 0.62);
  await expect(deck).toHaveAttribute('data-state', 'user');
}

/** Pause is the explicit takeover and holds past the idle resume (2 s); reset starts over. */
export async function pauseHoldsThenReset(page: Page, deck: Locator): Promise<void> {
  await deck.locator('[data-demo-key="pause"]').click();
  await expect(deck).toHaveAttribute('data-state', 'user');
  await pageWait(page, 3000);
  await expect(deck).toHaveAttribute('data-state', 'user');
  await deck.locator('[data-demo-key="reset"]').click();
  await expect(deck).toHaveAttribute('data-state', 'playing');
}
