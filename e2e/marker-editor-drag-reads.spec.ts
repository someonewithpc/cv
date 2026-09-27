import { expect, test } from '@playwright/test';

import { demoStack, frontPage, frontPageIndex, waitForIslandMounted } from './support/paperStack';

type Ticks = { frames: number; framesWithReads: number; glues: number; gluesWithReads: number };

/**
 * The walkthrough measures a target once, when a step points at it. Everything between
 * steps runs off those measurements: a drag's frames, from its press to its release, and
 * the re-glue tick that keeps the drawn cursor on a target the editor's accordions carry
 * away. A layout read in any of those forces a style and layout pass each time, so none
 * of them may read: the host page's rect is kept until a resize or scroll, and the re-glue
 * gets its boxes from an IntersectionObserver.
 */
test('walkthrough drags and re-glue ticks read no layout', async ({ page }) => {
  test.setTimeout(150_000);
  await page.addInitScript(() => {
    const log: Ticks = { frames: 0, framesWithReads: 0, glues: 0, gluesWithReads: 0 };
    (window as Window & { __ticks?: Ticks }).__ticks = log;
    let reads: number | null = null;
    const count = () => {
      if (reads !== null) reads += 1;
    };
    const measured = (callback: () => void) => {
      reads = 0;
      try {
        callback();
        return reads > 0;
      } finally {
        reads = null;
      }
    };

    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => {
      const fromDemo = new Error().stack?.includes('MockMapApp') ?? false;
      return raf((now) => {
        if (!fromDemo) {
          callback(now);
          return;
        }
        log.frames += 1;
        if (measured(() => callback(now))) log.framesWithReads += 1;
      });
    };

    const setInterval = window.setInterval.bind(window);
    window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      const fromDemo = new Error().stack?.includes('MockMapApp') ?? false;
      if (!fromDemo || typeof handler !== 'function') return setInterval(handler, timeout, ...args);
      return setInterval(() => {
        log.glues += 1;
        if (measured(() => handler(...args))) log.gluesWithReads += 1;
      }, timeout);
    }) as typeof window.setInterval;

    const IO = window.IntersectionObserver;
    window.IntersectionObserver = class extends IO {
      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        const fromDemo = new Error().stack?.includes('MockMapApp') ?? false;
        super(fromDemo
          ? (entries, observer) => {
            if (measured(() => callback(entries, observer))) log.gluesWithReads += 1;
          }
          : callback, options);
      }
    };

    const rect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
      count();
      return rect.call(this);
    };
    const computed = window.getComputedStyle.bind(window);
    window.getComputedStyle = (element, pseudo) => {
      count();
      return computed(element, pseudo);
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

  const ticks = () => page.evaluate(() => (window as Window & { __ticks?: Ticks }).__ticks!);
  await expect.poll(async () => (await ticks()).frames, { timeout: 120_000 }).toBeGreaterThan(60);

  const { frames, framesWithReads, glues, gluesWithReads } = await ticks();
  expect(glues, 'the re-glue ticks ran').toBeGreaterThan(0);
  expect(framesWithReads, `${framesWithReads} of ${frames} drag frames read layout`).toBe(0);
  expect(gluesWithReads, `${gluesWithReads} of ${glues} re-glue ticks read layout`).toBe(0);
});
