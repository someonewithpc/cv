import { expect, test } from '@playwright/test';

import { demoStack } from './support/paperStack';

/**
 * The demos' apps boot on visibility, so their stylesheets load with them rather than in
 * <head>, where they held up the first render. The sheet still has to be in before the app
 * mounts, or the demo shows unstyled for a frame.
 */
test('an island brings its stylesheet and mounts styled', async ({ page }) => {
  await page.addInitScript(() => {
    const seen: { position?: string } = {};
    (window as unknown as { __overlay: typeof seen }).__overlay = seen;
    new MutationObserver((records, observer) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          const overlay = node.matches('.mock-map-overlay') ? node : node.querySelector('.mock-map-overlay');
          if (!overlay) continue;
          seen.position = getComputedStyle(overlay).position;
          observer.disconnect();
          return;
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });

  await page.goto('/');
  const linked = () =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')]
        .map((link) => new URL(link.href).pathname)
        .filter((path) => path.includes('/_astro/')),
    );
  const atLoad = await linked();

  const stack = demoStack(page, 'Interactive Map Marker Editor');
  await stack.scrollIntoViewIfNeeded();
  await expect(stack.locator('.mock-map-overlay').first()).toBeAttached({ timeout: 15_000 });

  const added = (await linked()).filter((path) => !atLoad.includes(path));
  expect(added.length, 'stylesheets the Marker Editor loaded when it booted').toBeGreaterThan(0);

  // Read the moment React inserted the overlay, before the browser could paint it.
  const position = await page.evaluate(
    () => (window as unknown as { __overlay: { position?: string } }).__overlay.position,
  );
  expect(position).toBe('absolute');
});

/**
 * Safari restyles the whole page, about 380 ms at 1440 px, for a sheet that lands before
 * another sheet in the document. A sheet that comes after all of them costs it a few ms.
 */
test('an island stylesheet comes after every other sheet in the document', async ({ page }) => {
  await page.goto('/');
  const stack = demoStack(page, 'Interactive Map Marker Editor');
  await stack.scrollIntoViewIfNeeded();
  await expect(stack.locator('.mock-map-overlay').first()).toBeAttached({ timeout: 15_000 });

  const order = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('style, link[rel="stylesheet"]')].map((el) =>
      el instanceof HTMLLinkElement ? new URL(el.href).pathname : 'style',
    ),
  );
  const firstIsland = order.findIndex((entry) => /\/_astro\/MockMapApp\.[^/]+\.css$/.test(entry));
  expect(firstIsland, 'the Marker Editor map stylesheet').toBeGreaterThan(-1);
  expect(order.slice(firstIsland).filter((entry) => entry === 'style')).toEqual([]);
});
