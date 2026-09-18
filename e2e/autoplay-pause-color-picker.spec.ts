import { expect, test } from '@playwright/test';

import { frontPage, frontPageIndex, waitForIslandMounted } from './support/paperStack';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

function markerEditorStack(page: import('@playwright/test').Page) {
  return page.locator('article.technical-drawing-stack').nth(1);
}

test('main page: the walkthrough holds still while a native colour picker has focus', async ({ page }) => {
  // The walkthrough has to reach the marker editor's colour step by itself first.
  test.setTimeout(90_000);

  const stack = markerEditorStack(page);
  await stack.scrollIntoViewIfNeeded();
  const front = frontPage(stack, await frontPageIndex(stack));
  await waitForIslandMounted(front);

  const swatch = front.locator('input[type="color"]').first();
  await expect(swatch).toBeVisible({ timeout: 45_000 });

  // A native picker's popup is outside the document, so the page sees no further pointer
  // activity while it is open and the idle resume (2s) used to fire underneath it.
  await swatch.click({ force: true });
  await page.waitForTimeout(4000);

  await expect(swatch).toBeFocused();
  await expect(front.locator('.mock-map-demo-cursor')).toHaveCount(0);
  await expect(page.getByText('Demo playing · move to take over')).toHaveCount(0);
});
