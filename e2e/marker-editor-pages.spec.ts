import { expect, test } from '@playwright/test';

import { frontPage, frontPageIndex, swipeToPage } from './support/paperStack';

/**
 * Kept out of marker-editor.spec.ts: four other branches are editing that file, and a
 * test appended to its end conflicts with every one of them.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

function markerEditorStack(page: import('@playwright/test').Page) {
  return page.locator('article.technical-drawing-stack').nth(1);
}

test('parts and store pages: the diagram fills the sheet it sits on', async ({ page }) => {
  const stack = markerEditorStack(page);
  await stack.scrollIntoViewIfNeeded();

  for (const name of ['Composable Parts', 'Undoable Store']) {
    await swipeToPage(page, stack, name);
    const front = frontPage(stack, await frontPageIndex(stack));
    const diagram = front.locator('section .content > *').first();
    await expect(diagram).toBeVisible();

    const fit = await diagram.evaluate((el) => {
      const sheet = el.closest('section')!.getBoundingClientRect();
      const cell = el.parentElement!.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      return {
        inside:
          box.left >= sheet.left - 1
          && box.right <= sheet.right + 1
          && box.top >= sheet.top - 1
          && box.bottom <= sheet.bottom + 1,
        widthShare: box.width / cell.width,
      };
    });

    // Both halves matter: these two diagrams used to stop around two thirds of the
    // artwork area while the pages either side filled theirs, and the type scale that
    // fixes that is the one thing that could push them off the sheet.
    expect(fit.inside).toBe(true);
    expect(fit.widthShare).toBeGreaterThan(0.8);
  }
});
