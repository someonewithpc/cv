import { expect, test, type Locator } from '@playwright/test';

import { frontPageName } from './support/paperStack';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

/**
 * What the stack says about the pages already turned, and what it actually draws for them:
 * `turned` is the count fold-drag.ts keeps on the stack, `standing` the pages held above the
 * front one, and `showing` the sheet backs painted in the pile (see PaperStack/index.astro).
 * All three should agree with the number of turns.
 */
async function pile(stack: Locator): Promise<{ turned: string, standing: number, showing: number }> {
  return stack.evaluate((el) => {
    const pages = [...el.children] as HTMLElement[];
    const front = pages.find((page) => page.style.getPropertyValue('--page-index').trim() === '1')!;
    const top = front.getBoundingClientRect().top;
    return {
      turned: getComputedStyle(el).getPropertyValue('--pages-turned').trim(),
      standing: pages.filter((page) => page.getBoundingClientRect().top < top - 1).length,
      showing: pages.filter((page) => getComputedStyle(page, '::after').opacity === '1').length,
    };
  });
}

test('marker editor: the pile behind the stack counts the pages turned', async ({ page }) => {
  const stack = page.locator('article.technical-drawing-stack').nth(1);
  await stack.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  const turn = async (key: 'ArrowRight' | 'ArrowLeft') => {
    await stack.focus();
    await page.keyboard.press(key);
    // Long enough for the flip's own glide, and for the pile's 250ms ease, to finish.
    await page.waitForTimeout(2500);
  };

  // Nothing turned yet, so nothing stands behind the stack.
  expect(await pile(stack)).toEqual({ turned: '0', standing: 0, showing: 0 });

  await turn('ArrowRight');
  expect(await pile(stack)).toEqual({ turned: '1', standing: 1, showing: 1 });

  await turn('ArrowRight');
  expect(await pile(stack)).toEqual({ turned: '2', standing: 2, showing: 2 });
  expect(await frontPageName(stack)).toBe('Marker Editor');

  // The pile comes back down page by page, the same way it went up.
  await turn('ArrowLeft');
  expect(await pile(stack)).toEqual({ turned: '1', standing: 1, showing: 1 });

  await turn('ArrowLeft');
  expect(await pile(stack)).toEqual({ turned: '0', standing: 0, showing: 0 });
  expect(await frontPageName(stack)).toBe('Interactive Map Marker Editor');
});
