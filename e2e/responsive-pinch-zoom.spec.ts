import { expect, test, type Page } from '@playwright/test';

/**
 * DevTools' responsive mode is mobile emulation, so a trackpad pinch zooms the page itself
 * (visualViewport.scale), the way a finger does on a phone. At phone width a 3D scene fills the
 * zoomed-in view, and the scenes zoom their own camera on the wheel a pinch arrives as. When they
 * took that wheel whatever the page's zoom, the page stayed zoomed in with nowhere left to pinch
 * it back out from.
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

test('a page pinched in over a scene pinches back out', async ({ page }) => {
  await page.goto('/');
  // The scenes boot once they come into view
  const canvas = page.locator('canvas.scene-canvas').first();
  for (let y = 0; (await canvas.count()) === 0; y += 400) {
    expect(y, 'a scene boots somewhere down the page').toBeLessThan(20_000);
    await page.evaluate((to) => window.scrollTo(0, to), y);
    await page.waitForTimeout(250);
  }

  // Leave room above the scene for the pinch in, which has to land on the page and not the scene
  await canvas.evaluate((element) => {
    window.scrollBy(0, element.getBoundingClientRect().top - 200);
  });
  await page.waitForTimeout(800);
  const box = await canvas.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width };
  });
  expect(box.top).toBeGreaterThan(100);
  const x = box.left + box.width / 2;

  await pinch(page, x, box.top - 40, 3);
  await page.waitForTimeout(400);
  expect(await scale(page)).toBeGreaterThan(2);

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
  await page.waitForTimeout(400);
  expect(await scale(page)).toBeCloseTo(1, 2);
});
