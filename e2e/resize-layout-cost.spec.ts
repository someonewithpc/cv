import { expect, test } from '@playwright/test';

/**
 * Docking DevTools narrows the window, and the page keeps showing its last frame until
 * layout at the new width is done. With #demos a subgrid of main, that layout took 1.3 s at
 * each step from 1440 to 900 and back, so the reader saw the wider page held in the smaller
 * window for over a second each time. Measured as Chrome's own layout time, which a busy
 * machine inflates far less than a frame timer.
 */

const WIDE = { width: 1440, height: 900 };
const DOCKED = { width: 900, height: 900 };
const BUDGET_SECONDS = 0.5;

test('narrowing the window and widening it again lays the page out quickly', async ({ page }) => {
  await page.setViewportSize(WIDE);
  await page.goto('/');
  await page.waitForTimeout(2000);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const layoutSeconds = async () => {
    const { metrics } = await cdp.send('Performance.getMetrics');
    return metrics.find((metric) => metric.name === 'LayoutDuration')?.value ?? 0;
  };
  const nextFrame = () => page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => done())));

  const before = await layoutSeconds();
  for (const size of [DOCKED, WIDE]) {
    await page.setViewportSize(size);
    await nextFrame();
  }
  const spent = (await layoutSeconds()) - before;

  expect(spent, `layout time for one dock and undock, in seconds`).toBeLessThan(BUDGET_SECONDS);
});
