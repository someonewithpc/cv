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

/**
 * The artwork scales its type by --sheet-inline and --sheet-block. They come from CSS, worked out
 * from the viewport the way the page lays the stack out (the frame in Stack.astro). The stack's
 * ResizeObserver used to write them onto every stack at each resize step, which doubled the style
 * each step cost. If the page's geometry changes and the formula is not changed with it, the
 * sheet's measure no longer matches the sheet.
 *
 * 400 is a portrait sheet, 1060 is where the desk's mat narrows the column below --breakout-max,
 * and 1440 is a capped sheet.
 */
for (const javaScriptEnabled of [true, false]) {
  test.describe(`script ${javaScriptEnabled ? 'on' : 'off'}`, () => {
    test.use({ javaScriptEnabled });

    test('the sheet\'s measure matches the sheet at every width', async ({ page }) => {
      await page.goto('/');
      for (const width of [400, 1060, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(100);
        const sheet = await page.locator('article.technical-drawing-stack section').first().evaluate((section) => {
          // The variables hold the expression, not pixels, so a box sized by them reads them out.
          const probe = document.createElement('div');
          probe.style.cssText = 'position: absolute; visibility: hidden; width: var(--sheet-inline); height: var(--sheet-block)';
          section.append(probe);
          const measured = getComputedStyle(probe);
          const box = section.getBoundingClientRect();
          const inline = parseFloat(measured.width);
          const block = parseFloat(measured.height);
          probe.remove();
          return {
            inline,
            block,
            width: box.width,
            height: box.height,
            written: [...document.querySelectorAll<HTMLElement>('article.technical-drawing-stack, .flip-hints')]
              .some((el) => /--(sheet|stack)-/.test(el.getAttribute('style') ?? '')),
          };
        });
        expect(Math.abs(sheet.inline - sheet.width), `--sheet-inline ${sheet.inline} against ${sheet.width} at ${width}px`).toBeLessThanOrEqual(1);
        expect(Math.abs(sheet.block - sheet.height), `--sheet-block ${sheet.block} against ${sheet.height} at ${width}px`).toBeLessThanOrEqual(1);
        expect(sheet.written, 'no script writes the sheet\'s measure').toBe(false);
      }
    });
  });
}
