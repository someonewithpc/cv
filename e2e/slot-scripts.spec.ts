import { expect, test } from '@playwright/test';

import { frontPage, frontPageIndex, waitForIslandMounted } from './support/paperStack';

/**
 * A component under a PaperStack page carries its own <script> again (PaperStack keeps the
 * slot's SlotString whole, so Astro replays its hoisted scripts), and boots its own hosts
 * through pageIsland.ts. Nothing routes through a data-boot-module dispatcher any more.
 */
test('slotted components boot from their own scripts', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('[data-boot-module]')).toHaveCount(0);

  const stacks = page.locator('article.technical-drawing-stack');
  for (const [index, host] of [
    [1, '[data-mock-map]'],
    [2, '[data-space-builder-island]'],
  ] as const) {
    const stack = stacks.nth(index);
    await stack.scrollIntoViewIfNeeded();
    const front = frontPage(stack, await frontPageIndex(stack));
    await expect(front.locator(host)).toHaveCount(1);
    await waitForIslandMounted(front, host);
  }
});
