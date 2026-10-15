import { isDeepStrictEqual } from 'node:util';

import type { Page } from '@playwright/test';

/**
 * Waits for `count` rendering updates. Resize and intersection observers report in the update
 * after the change that fired them, and what they schedule lands in a frame after that, so two
 * frames are the least a spec can wait to see a change the page makes in answer to another.
 */
export async function framesPass(page: Page, count = 2): Promise<void> {
  await page.evaluate((left) => new Promise<void>((done) => {
    const step = (n: number) => (n ? requestAnimationFrame(() => step(n - 1)) : done());
    step(left);
  }), count);
}

/**
 * Reads `read` until two reads two frames apart agree, then returns the second. A spec that
 * measures the page after a load, a scroll or a resize waits for the fonts in use, then for
 * the page to stop changing what it is about to measure, however long the observers and the
 * scripts behind them take, rather than for a time that has to guess it.
 */
export async function steady<T>(page: Page, read: () => Promise<T>, timeout = 10_000): Promise<T> {
  const deadline = Date.now() + timeout;
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  let last = await read();
  for (;;) {
    await framesPass(page);
    const next = await read();
    if (isDeepStrictEqual(next, last)) return next;
    if (Date.now() > deadline) throw new Error(`still changing after ${timeout}ms: ${JSON.stringify(next)}`);
    last = next;
  }
}

/**
 * Waits for the page to stop changing its size and scroll position: after a load, the fonts
 * coming in and the islands booting on screen, or the browser landing on a fragment.
 */
export async function pageSteady(page: Page): Promise<void> {
  await steady(page, () => page.evaluate(() => {
    const root = document.documentElement;
    return [root.scrollWidth, root.scrollHeight, scrollX, scrollY];
  }));
}
