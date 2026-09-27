import { expect, test } from '@playwright/test';

import { demoStack, frontPage, frontPageIndex, waitForIslandMounted } from './support/paperStack';

type DragFrames = { ticks: number; framesWithReads: number };

/**
 * A walkthrough drag moves the drawn cursor and the dragged point once per frame, from
 * points it measured when the drag started. A layout read inside those frames forces a
 * whole style and layout pass each time, so the frames must not read any: only the first
 * and last frame of a drag may measure.
 */
test('walkthrough drag frames read no layout', async ({ page }) => {
  test.setTimeout(150_000);
  await page.addInitScript(() => {
    const log: DragFrames = { ticks: 0, framesWithReads: 0 };
    (window as Window & { __dragFrames?: DragFrames }).__dragFrames = log;
    let frame: { reads: number } | null = null;
    const count = () => {
      if (frame) frame.reads += 1;
    };

    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => {
      const fromDemo = new Error().stack?.includes('MockMapApp') ?? false;
      return raf((now) => {
        if (!fromDemo) {
          callback(now);
          return;
        }
        frame = { reads: 0 };
        try {
          callback(now);
        } finally {
          log.ticks += 1;
          if (frame.reads > 0) log.framesWithReads += 1;
          frame = null;
        }
      });
    };

    const rect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
      count();
      return rect.call(this);
    };
    for (const name of ['scrollX', 'scrollY', 'pageXOffset', 'pageYOffset'] as const) {
      const owner = Object.getOwnPropertyDescriptor(window, name) ? window : Window.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(owner, name);
      if (!descriptor?.get) continue;
      const get = descriptor.get;
      Object.defineProperty(owner, name, {
        ...descriptor,
        get() {
          count();
          return get.call(this);
        },
      });
    }
  });

  await page.goto('/');
  const stack = demoStack(page, 'Interactive Map Marker Editor');
  await stack.scrollIntoViewIfNeeded();
  const island = await waitForIslandMounted(frontPage(stack, await frontPageIndex(stack)));
  await expect(island.locator('.mock-map-overlay')).toBeVisible({ timeout: 15_000 });

  const frames = () => page.evaluate(() => (window as Window & { __dragFrames?: DragFrames }).__dragFrames!);
  await expect.poll(async () => (await frames()).ticks, { timeout: 120_000 }).toBeGreaterThan(60);

  const { ticks, framesWithReads } = await frames();
  expect(framesWithReads * 5, `${framesWithReads} of ${ticks} drag frames read layout`).toBeLessThan(ticks);
});
