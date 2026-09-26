import { expect, type Locator, type Page, test } from '@playwright/test';

import { demoStack, frontPage, frontPageIndex, waitForIslandMounted } from './support/paperStack';

/**
 * A drag of the window edge resizes the page every frame. The measurements that only the
 * settled size needs (a scene's drawing buffer, the event bus token's resting place) wait for
 * the drag to stop and run once, for the final width, instead of forcing a layout at every
 * step. src/client/settledResize.ts does the waiting.
 *
 * Every width is below the 60em the page content caps at and above the 40em where the sheets
 * turn portrait, so each step moves the sheets. The drag widens the window: narrowing it would
 * pull the next stack into view, and its scene would take the one WebGL context over.
 */

const WIDTHS = Array.from({ length: 12 }, (_, i) => 740 + i * 20);

// A few steps may still go through if the machine stalls longer than the settle window
// between two of them; a page that measures every step goes through all twelve.
const MAX_MID_DRAG = 3;

test.use({ reducedMotion: 'reduce', viewport: { width: 720, height: 900 } });

async function nextFrame(page: Page) {
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => done())));
}

/** Counts writes to `attribute` on the element while the window is dragged through WIDTHS. */
async function dragWindow(page: Page, target: Locator, attribute: string) {
  await target.evaluate((el, name) => {
    const w = window as unknown as { __writes: number };
    w.__writes = 0;
    new MutationObserver((records) => { w.__writes += records.length; })
      .observe(el, { attributes: true, attributeFilter: [name] });
  }, attribute);
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await nextFrame(page);
  }
  return page.evaluate(() => (window as unknown as { __writes: number }).__writes);
}

test('a window drag sizes a scene\'s drawing buffer once, for the final width', async ({ page }) => {
  await page.goto('/');
  const stack = demoStack(page, 'Space Builder · Add Tool');
  await stack.scrollIntoViewIfNeeded();
  const island = await waitForIslandMounted(frontPage(stack, await frontPageIndex(stack)));
  await expect(island.locator('[data-ready]')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
  const canvas = island.locator('canvas[data-scene-canvas]');
  await expect(canvas).toBeVisible();
  await page.waitForTimeout(1_000);

  const midDrag = await dragWindow(page, canvas, 'width');
  expect(midDrag, 'drawing buffer resizes during the drag').toBeLessThanOrEqual(MAX_MID_DRAG);

  // The drag moves the stacks above this one, so the scene may have gone off screen and
  // handed its WebGL context on. Back in view, its buffer has to match the final width.
  await stack.scrollIntoViewIfNeeded();
  // SpaceBuilderScene caps its pixel ratio at 1.25.
  const wanted = () => canvas.evaluate((el) => Math.floor(el.clientWidth * Math.min(devicePixelRatio, 1.25)));
  await expect.poll(async () => Math.abs(Number(await canvas.getAttribute('width')) - await wanted()), {
    message: 'buffer sized for the final width',
  }).toBeLessThanOrEqual(1);
});

test('a window drag moves the event bus token once, onto the final return', async ({ page }) => {
  await page.goto('/');
  const stack = demoStack(page, 'GNU social · Event Dispatch');
  await stack.scrollIntoViewIfNeeded();
  const front = frontPage(stack, await frontPageIndex(stack));
  const bus = front.locator('.event-bus[data-live]');
  await expect(bus).toHaveAttribute('data-ready', 'true', { timeout: 15_000 });
  await expect(bus).not.toHaveAttribute('data-result', 'pending');
  const token = bus.locator('.token');
  await expect(token).toBeVisible();
  await page.waitForTimeout(1_000);
  const before = await token.getAttribute('style');

  const midDrag = await dragWindow(page, token, 'style');
  expect(midDrag, 'token moves during the drag').toBeLessThanOrEqual(MAX_MID_DRAG);

  await expect.poll(() => token.getAttribute('style'), { message: 'token moved after the drag' })
    .not.toBe(before);
});
