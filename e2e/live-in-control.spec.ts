import type { Page } from '@playwright/test';

import { frontPage, frontPageIndex, waitForIslandMounted } from './support/paperStack';
import { expect, test } from './support/timeScale';

/**
 * A walkthrough readout is a polite live region only while the visitor drives the demo
 * (src/client/autoplayStatus.ts): while the walkthrough plays, a screen reader would hear
 * every step of it.
 */
const DEMOS = [
  { title: 'Synthetic Properties', region: '.query-result' },
  { title: 'GNU social · Event Dispatch', region: '.event-bus[data-live] figure.res' },
  { title: 'Fediverse Playground', region: '[data-fediverse-playground] [data-status]' },
];

function stack(page: Page, title: string) {
  return page.locator('article.technical-drawing-stack').filter({
    has: page.locator('h2.typewriter', { hasText: title }),
  });
}

for (const { title, region } of DEMOS) {
  test(`${title}: the readout is live only while the visitor is in control`, async ({ page }) => {
    await page.goto('/');
    const demo = stack(page, title);
    await demo.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    const front = frontPage(demo, await frontPageIndex(demo));
    await waitForIslandMounted(front);
    const deck = front.locator('[data-demo-transport]');
    const readout = front.locator(region);
    await expect(deck).toHaveAttribute('data-state', 'playing', { timeout: 30_000 });
    await expect(readout).not.toHaveAttribute('aria-live');

    await deck.locator('[data-demo-key="pause"]').click();
    await expect(deck).toHaveAttribute('data-state', 'user');
    await expect(readout).toHaveAttribute('aria-live', 'polite');

    await deck.locator('[data-demo-key="play"]').click();
    await expect(deck).toHaveAttribute('data-state', 'playing');
    await expect(readout).not.toHaveAttribute('aria-live');
  });
}
