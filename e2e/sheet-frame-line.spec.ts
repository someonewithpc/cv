import { expect, test, type Locator } from '@playwright/test';

import { demoStack, frontPage, frontPageIndex, turnToPage } from './support/paperStack';

/**
 * On a phone sheet the type is at its floor and the Variants card keeps the product's size, so
 * these layers are taller than the sheet's cell. A squat landscape sheet is too short for the
 * Missing Variants panel as well. Each layer scrolls inside its frame. Before that they ran up
 * to 145px past the frame line, over the title block and off the sheet.
 */
const PAGES = [
  ['Space Builder · Object Variants', 'Missing Variants'],
  ['GNU social · Event Dispatch', 'Module Discovery'],
  ['GNU social · Event Dispatch', 'Build-Time Guard'],
] as const;

/** Elements of the front sheet past its frame line on any side, skipping what a box inside the frame clips. */
function pastFrameLine(page: Locator): Promise<string[]> {
  return page.locator(':scope > section').evaluate((sheet) => {
    const box = sheet.getBoundingClientRect();
    const style = getComputedStyle(sheet);
    const frame = {
      left: box.left + parseFloat(style.paddingLeft),
      right: box.right - parseFloat(style.paddingRight),
      top: box.top + parseFloat(style.paddingTop),
      bottom: box.bottom - parseFloat(style.paddingBottom),
    };
    const inside = (r: DOMRect) => r.left >= frame.left - 1 && r.right <= frame.right + 1
      && r.top >= frame.top - 1 && r.bottom <= frame.bottom + 1;
    const found: string[] = [];
    for (const el of sheet.querySelectorAll('.content *')) {
      if (el.closest('svg')) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || inside(r)) continue;
      let clipped = false;
      for (let clip = el.parentElement; clip && clip !== sheet; clip = clip.parentElement) {
        const { overflowX, overflowY } = getComputedStyle(clip);
        if (overflowX === 'visible' && overflowY === 'visible') continue;
        if (inside(clip.getBoundingClientRect())) {
          clipped = true;
          break;
        }
      }
      if (!clipped) found.push(`${el.tagName.toLowerCase()}.${el.classList[0] ?? ''}`);
    }
    return found;
  });
}

for (const width of [320, 768]) {
  test(`tall sheets stay inside the frame line at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    for (const [title, name] of PAGES) {
      const stack = demoStack(page, title);
      await stack.scrollIntoViewIfNeeded();
      await turnToPage(stack, name);
      const front = frontPage(stack, await frontPageIndex(stack));
      expect(await pastFrameLine(front), `${name}: elements past the frame line`).toEqual([]);
    }
  });
}
