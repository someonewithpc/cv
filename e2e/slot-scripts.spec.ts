import { expect, test } from '@playwright/test';

import { demoStack, frontPage, frontPageIndex, waitForIslandMounted } from './support/paperStack';

/**
 * A component under a PaperStack page carries its own <script> again (PaperStack keeps the
 * slot's SlotString whole, so Astro replays its hoisted scripts), and boots its own hosts
 * through pageIsland.ts. Nothing routes through a data-boot-module dispatcher any more.
 */
test('slotted components boot from their own scripts', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('[data-boot-module]')).toHaveCount(0);

  for (const [title, host] of [
    ['Interactive map marker editor', '[data-mock-map]'],
    ['Space Builder add tool', '[data-space-builder-island]'],
  ] as const) {
    const stack = demoStack(page, title);
    await stack.scrollIntoViewIfNeeded();
    const front = frontPage(stack, await frontPageIndex(stack));
    await expect(front.locator(host)).toHaveCount(1);
    await waitForIslandMounted(front, host);
  }
});
