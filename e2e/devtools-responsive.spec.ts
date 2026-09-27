import { expect, test, type Browser, type CDPSession, type Page } from '@playwright/test';

/**
 * Chrome's device toolbar is mobile emulation: `Emulation.setDeviceMetricsOverride` with
 * `mobile`, a device scale factor and touch, applied to a page already laid out at desk width
 * and applied again for every preset picked. After each preset the page has to sit at the
 * emulated width with the visual viewport unzoomed, carry the sheet-type values a fresh load at
 * that size gets (Stack.astro's ResizeObserver writes --sheet-inline, --sheet-block and the
 * orientation and width-band attributes, and the artwork's type is sized from them), and get
 * there in a bounded number of layouts rather than settle over several observer rounds.
 *
 * Out of scope, by the browser's design: a pinch zoom in device mode (ctrl+wheel with a
 * mouse, or a trackpad pinch) is kept by Chrome across presets and restored on reload along
 * with the scroll position. Toggling the device toolbar off and on, or loading the URL again,
 * clears it.
 */

const DESK = { width: 1440, height: 900 };

/** The presets a person flips through, with the device scale factor each one applies. */
const PRESETS = [
  { name: 'Responsive at 393', width: 393, height: 852, deviceScaleFactor: 2 },
  { name: 'iPhone 16', width: 393, height: 852, deviceScaleFactor: 3 },
  { name: 'iPad Mini', width: 768, height: 1024, deviceScaleFactor: 2 },
  { name: 'Responsive at 393 again', width: 393, height: 852, deviceScaleFactor: 2 },
];

/**
 * One preset switch took 22 layouts on main df6c04be (a first layout at the new width, the
 * observers' write rounds, then the hint and annotation frames). Twice that is a guard against
 * a change that adds observer rounds, not a target.
 */
const LAYOUTS_PER_PRESET = 44;

/** How long the layout count has to hold still before the page counts as settled. */
const QUIET_MS = 500;

type Preset = (typeof PRESETS)[number];

/** What the device toolbar sends when a preset is picked. */
async function applyPreset(cdp: CDPSession, preset: Preset): Promise<void> {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: preset.width,
    height: preset.height,
    deviceScaleFactor: preset.deviceScaleFactor,
    mobile: true,
    screenWidth: preset.width,
    screenHeight: preset.height,
    screenOrientation: { angle: 0, type: 'portraitPrimary' },
  });
}

async function layoutCount(cdp: CDPSession): Promise<number> {
  const { metrics } = await cdp.send('Performance.getMetrics');
  return metrics.find((metric) => metric.name === 'LayoutCount')?.value ?? 0;
}

/** Waits until Chrome's layout count holds still, and returns it. Reads nothing that forces a layout. */
async function settle(page: Page, cdp: CDPSession): Promise<number> {
  const started = Date.now();
  let count = await layoutCount(cdp);
  let quietSince = Date.now();
  while (Date.now() - quietSince < QUIET_MS) {
    expect(Date.now() - started, 'the page keeps laying out').toBeLessThan(15_000);
    await page.waitForTimeout(100);
    const now = await layoutCount(cdp);
    if (now !== count) {
      count = now;
      quietSince = Date.now();
    }
  }
  return count;
}

/** The sheet-type values every stack carries, in page order. */
function sheets(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('article.technical-drawing-stack')].map((stack) => ({
      title: stack.getAttribute('aria-label'),
      inline: stack.style.getPropertyValue('--sheet-inline'),
      block: stack.style.getPropertyValue('--sheet-block'),
      orientation: stack.dataset.sheetOrientation,
      band: stack.dataset.sheetWidth,
    })),
  );
}

/** The same values on a page loaded at that size, cached per size since presets repeat. */
const fresh = new Map<string, Promise<Awaited<ReturnType<typeof sheets>>>>();
function freshSheets(browser: Browser, preset: Preset) {
  const key = `${preset.width}x${preset.height}`;
  let reading = fresh.get(key);
  if (!reading) {
    reading = (async () => {
      const context = await browser.newContext({
        viewport: { width: preset.width, height: preset.height },
        deviceScaleFactor: preset.deviceScaleFactor,
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Performance.enable');
      await page.goto('/');
      await settle(page, cdp);
      const values = await sheets(page);
      await context.close();
      return values;
    })();
    fresh.set(key, reading);
  }
  return reading;
}

test('every device preset shows the page unzoomed, at its width, laid out as a fresh load', async ({ page, browser }) => {
  await page.setViewportSize(DESK);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  await page.goto('/');
  await settle(page, cdp);

  // The toolbar turns touch on with the first preset and leaves it on.
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await cdp.send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });

  for (const preset of PRESETS) {
    const before = await layoutCount(cdp);
    await applyPreset(cdp, preset);
    const layouts = (await settle(page, cdp)) - before;

    const view = await page.evaluate(() => ({
      scale: window.visualViewport!.scale,
      innerWidth: window.innerWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(view.scale, `${preset.name}: visual viewport scale`).toBe(1);
    expect(view.clientWidth, `${preset.name}: layout width`).toBe(preset.width);
    expect(view.innerWidth, `${preset.name}: window width`).toBe(preset.width);
    expect(view.scrollWidth, `${preset.name}: nothing reaches past the frame`).toBeLessThanOrEqual(preset.width);
    expect(await sheets(page), `${preset.name}: sheet type as on a fresh load`).toEqual(await freshSheets(browser, preset));
    expect(layouts, `${preset.name}: layouts until the page settled`).toBeLessThanOrEqual(LAYOUTS_PER_PRESET);
    console.log(`${preset.name}: ${layouts} layouts`);
  }
});
