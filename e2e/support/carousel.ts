import type { Locator, Page } from '@playwright/test';

/** Clicks where one of a carousel's arrows sits; they are the scroller's own buttons, with no node to find. */
export async function clickCarouselArrow(page: Page, scroller: Locator, side: 'previous' | 'next'): Promise<void> {
  const box = await scroller.boundingBox();
  if (!box) throw new Error('The carousel has no layout box');
  const x = side === 'next' ? box.x + box.width - 14 : box.x + 14;
  await page.mouse.click(x, box.y + box.height / 2);
}
