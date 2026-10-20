import { expect, test, type Page } from '@playwright/test';

import { demoStack, frontPage, frontPageIndex } from './support/paperStack';
import { waitForSceneReady } from './support/spaceBuilder';

/**
 * At phone width a 3D scene is most of the screen. A finger swiping up over one that nobody
 * has taken over scrolls the page and leaves the walkthrough playing; a tap takes the scene
 * over, and from then on the finger orbits it, as in the product.
 */
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

async function touchDrag(page: Page, x: number, y0: number, y1: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
  for (let i = 1; i <= 12; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + (y1 - y0) * i / 12 }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

for (const title of ['Space Builder · Add Tool', 'Space Builder · Drag & Drop']) {
  test(`a swipe over the ${title} scene scrolls the page until a tap takes it over`, async ({ page }) => {
    await page.goto('/');
    const stack = demoStack(page, title);
    await stack.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    const app = await waitForSceneReady(frontPage(stack, await frontPageIndex(stack)));
    const canvas = app.locator('canvas.scene-canvas');
    const caption = stack.locator('xpath=ancestor::section[contains(@class,"callout")][1]').locator('.callout-card [data-demo-caption]');
    await expect(caption).toHaveText('AUTO PLAYING', { timeout: 15_000 });

    const centre = async () => {
      const box = (await canvas.boundingBox())!;
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };
    const scrollY = () => page.evaluate(() => window.scrollY);

    let at = await centre();
    const before = await scrollY();
    await touchDrag(page, at.x, at.y + 60, at.y - 60);
    await expect.poll(scrollY, { message: 'the page scrolls under the finger' }).toBeGreaterThan(before + 40);
    await expect(caption).toHaveText('AUTO PLAYING');

    at = await centre();
    await page.touchscreen.tap(at.x, at.y);
    await expect(caption).toHaveText('MANUAL CONTROL');

    // Drag and Drop hands the scene back to its walkthrough a moment after the finger lifts
    if (!title.endsWith('Add Tool')) return;
    at = await centre();
    const held = await scrollY();
    await touchDrag(page, at.x, at.y + 60, at.y - 60);
    await expect(app).toHaveAttribute('data-touch-claimed', '');
    await page.waitForTimeout(300);
    expect(await scrollY(), 'a taken-over scene keeps the finger').toBe(held);
  });
}
