import { expect, test } from '@playwright/test';

import { swipeStack } from './support/paperStack';

/**
 * A tablet has no horizontal scrollbar to warn with. Chrome answers a page that overflows
 * sideways by widening the layout viewport, and `position: fixed` boxes are laid out against
 * that wider viewport rather than the 768 the visitor can see. The theme picker sits at
 * `right: 0`, so overflow anywhere on the page walks it off the edge of the screen and only a
 * reload brings it back.
 *
 * PaperStack used to leave that overflow behind. fold-drag.ts's renderFold puts the flip hint
 * at the flap's visual centre in page-local pixels, once per drag frame, and clearFoldRender
 * left those pixels on the hint when the gesture settled. Narrowing the window afterwards
 * stranded the hint (invisible at rest, still laid out) off the page's right edge: from a 768
 * viewport the document reached 955, which is the width the layout viewport then took.
 *
 * The emulation has to come from CDP. Playwright's own viewport sizing keeps the layout
 * viewport pinned to the window, which is the one thing this test is watching for.
 */

const TABLET_WIDTH = 768;
const TABLET_HEIGHT = 1024;
const WIDE_WIDTH = 1200;
/** What a dragged DevTools handle passes through on its way in, rather than one jump. */
const STEPS = [1120, 1040, 960, 880, 800, TABLET_WIDTH];

test('a page turned at desk width leaves nothing hanging off a tablet viewport', async ({ context, page }) => {
  const cdp = await context.newCDPSession(page);
  const emulate = (width: number) =>
    cdp.send('Emulation.setDeviceMetricsOverride', {
      width,
      height: TABLET_HEIGHT,
      deviceScaleFactor: 2,
      mobile: true,
      screenWidth: width,
      screenHeight: TABLET_HEIGHT,
      screenOrientation: { angle: 0, type: 'portraitPrimary' },
    });

  await emulate(WIDE_WIDTH);
  await page.goto('/');

  const stack = page.locator('article.technical-drawing-stack').first();
  await stack.scrollIntoViewIfNeeded();
  await expect(stack).toBeVisible();
  await page.waitForTimeout(1000);

  // The gesture is what writes the hint's pixels; settling is what used to leave them.
  await swipeStack(page, stack, true);

  for (const width of STEPS) {
    await emulate(width);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(1500);

  const reading = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    bodyScrollWidth: document.body.scrollWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    // The initial containing block, which stays at the emulated width whatever the layout
    // viewport does — the honest reading of how wide the screen is.
    clientWidth: document.documentElement.clientWidth,
  }));

  expect(reading.clientWidth).toBe(TABLET_WIDTH);
  expect(reading.innerWidth).toBe(TABLET_WIDTH);
  expect(reading.bodyScrollWidth).toBeLessThanOrEqual(reading.innerWidth);
  expect(reading.documentScrollWidth).toBeLessThanOrEqual(reading.innerWidth);

  // The symptom the reader actually meets.
  const picker = await page.locator('#theme-picker').boundingBox();
  expect(picker).not.toBeNull();
  expect(picker!.x + picker!.width).toBeLessThanOrEqual(TABLET_WIDTH);
});
