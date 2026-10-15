import { expect, test, type Page } from '@playwright/test';

import { demoStack } from './support/paperStack';
import { steady } from './support/steady';

/**
 * DevTools' responsive mode is mobile emulation, so a trackpad pinch zooms the page itself
 * (visualViewport.scale), the way a finger does on a phone. The pinch arrives as a ctrl wheel, and
 * the 3D scenes used to take it to move their camera. At phone width a scene fills the zoomed-in
 * view, so the page stayed zoomed in. A pinch over a scene now always goes to the page.
 */

test.use({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

const scale = (page: Page) => page.evaluate(() => window.visualViewport!.scale);

/** A trackpad pinch: the renderer sees it as ctrl+wheel before it zooms anything. Coordinates are
 * CSS px from the visual viewport's top left. */
async function pinch(page: Page, x: number, y: number, scaleFactor: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.synthesizePinchGesture', { x, y, scaleFactor, gestureSourceType: 'mouse' });
  await cdp.detach();
}

test('a pinch over a scene zooms the page in and back out', async ({ page }) => {
  await page.goto('/');
  // The scenes boot once they come into view
  const canvas = page.locator('canvas.scene-canvas').first();
  await demoStack(page, 'Space Builder · Add Tool').scrollIntoViewIfNeeded();
  await expect(canvas, 'a scene boots once its stack is on screen').toBeAttached({ timeout: 15_000 });

  await canvas.evaluate((element) => {
    window.scrollBy(0, element.getBoundingClientRect().top - 100);
  });
  const center = await steady(page, () => canvas.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + Math.min(rect.height, 400) / 2 };
  }));
  await expect.poll(
    () => page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.matches('canvas.scene-canvas'), center),
    { message: 'the pinch in lands on the scene' },
  ).toBe(true);

  await pinch(page, center.x, center.y, 3);
  await expect.poll(() => scale(page)).toBeGreaterThan(2);

  // Somewhere in the zoomed-in view where the scene itself, not its panels, is under the pointer
  const point = await page.evaluate(() => {
    const viewport = window.visualViewport!;
    for (let y = viewport.height - 10; y > 0; y -= 10) {
      for (let x = 10; x < viewport.width; x += 10) {
        const hit = document.elementFromPoint(viewport.offsetLeft + x, viewport.offsetTop + y);
        if (hit?.matches('canvas.scene-canvas')) return { x, y };
      }
    }
    return null;
  });
  expect(point, 'the zoomed-in view has the scene in it').not.toBeNull();

  await pinch(page, point!.x, point!.y, 0.2);
  await expect.poll(async () => Math.abs((await scale(page)) - 1)).toBeLessThan(0.005);
});
