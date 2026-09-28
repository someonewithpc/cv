import { expect, test, type Locator } from '@playwright/test';

import { frontPage, frontPageIndex, pressTurn } from './support/paperStack';

/**
 * Page.astro hands every title-block cell a random tilt through --random1 and --random2, from
 * a Sass loop over the page's index in its wrapper and the cell's index in its row. The loop
 * is bounded to what the markup can reach (a page is its wrapper's first child, or the second
 * behind .paper-front's clip), so a cell that reads no value would mean the bound is off.
 */
async function cellsWithoutJitter(front: Locator): Promise<string[]> {
  return front.locator(':scope > section > table td').evaluateAll((cells) =>
    cells
      .filter((cell) => ['--random1', '--random2'].some((name) => getComputedStyle(cell).getPropertyValue(name).trim() === ''))
      .map((cell) => cell.className || cell.textContent?.trim().slice(0, 20) || 'td'),
  );
}

test('every title-block cell keeps its tilt, before and after a page turn', async ({ page }) => {
  await page.goto('/');
  const stack = page.locator('article.technical-drawing-stack').nth(1);
  await stack.scrollIntoViewIfNeeded();

  const first = frontPage(stack, await frontPageIndex(stack));
  expect(await first.locator(':scope > section > table td').count()).toBeGreaterThan(0);
  expect(await cellsWithoutJitter(first), 'front page cells with no tilt').toEqual([]);

  await pressTurn(stack, 'ArrowRight');
  const second = frontPage(stack, await frontPageIndex(stack));
  expect(await cellsWithoutJitter(second), 'second page cells with no tilt').toEqual([]);
});
