import { expect, test, type Locator, type Page } from '@playwright/test';

import { forEachStackInLane, LANES, settledAfter } from './support/paperStack';

/**
 * Opening Chrome's responsive device mode is mobile emulation applied to a page that is
 * already laid out at desk width. The emulated frame becomes the initial containing block,
 * but the *layout* viewport takes the width of the widest thing on the page, so anything
 * reaching past the frame's right edge widens it: `innerWidth` runs ahead of
 * `documentElement.clientWidth`, the visitor gets a 768px window onto a wider page, and every
 * `position: fixed` box, the theme picker among them, is laid out against the wider one.
 * From the reader's side the page is simply zoomed in and scrolls sideways.
 *
 * So each case here puts the page into a state at 1440x900, switches to an emulated frame
 * without reloading, and asserts the two widths agree. A phone meets the same thing without
 * any DevTools involved.
 */

const DESKTOP = { width: 1440, height: 900 };
const FRAMES = [
  { name: 'tablet portrait', width: 768, height: 1024 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet landscape', width: 1024, height: 768 },
];

/** One session per page: a fresh one per switch outlives its usefulness and costs a round trip. */
const sessions = new WeakMap<Page, Promise<Awaited<ReturnType<typeof newSession>>>>();
const newSession = (page: Page) => page.context().newCDPSession(page);
function cdpFor(page: Page) {
  let session = sessions.get(page);
  if (!session) {
    session = newSession(page);
    sessions.set(page, session);
  }
  return session;
}

/** What the device-mode button does. `mobile: true` is the part that widens the layout viewport. */
async function deviceMode(page: Page, width: number, height: number): Promise<void> {
  const cdp = await cdpFor(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 2,
    mobile: true,
    screenWidth: width,
    screenHeight: height,
    screenOrientation: { angle: 0, type: width > height ? 'landscapePrimary' : 'portraitPrimary' },
  });
}

async function widths(page: Page) {
  return page.evaluate(() => ({
    innerWidth: window.innerWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
  }));
}

/**
 * The resting dog-ear's hit area is the clip triangle its `transform` mirrors, not its box, and
 * the idle pulse keeps resizing it, so ask the page which point actually lands on the flap
 * rather than aiming at a corner and missing.
 */
async function flapPoint(stack: Locator): Promise<{ x: number, y: number }> {
  const point = await stack.evaluate((element) => {
    const flap = element.querySelector('.paper-fold');
    if (!flap) return null;
    const box = flap.getBoundingClientRect();
    for (let dy = 0.1; dy < 1; dy += 0.08) {
      for (let dx = 0.1; dx < 1; dx += 0.08) {
        const x = box.left + box.width * dx;
        const y = box.top + box.height * dy;
        if (document.elementFromPoint(x, y) === flap) return { x, y };
      }
    }
    return null;
  });
  if (!point) throw new Error('No point on the fold flap is hittable');
  return point;
}

async function openAtDesk(page: Page): Promise<void> {
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  await page.waitForTimeout(1500);
}

/** Runs `enter`, switches to every emulated frame, and checks the widths in each. */
async function checkFrames(page: Page, enter: () => Promise<void>) {
  await enter();
  for (const frame of FRAMES) {
    await deviceMode(page, frame.width, frame.height);
    await page.waitForTimeout(300);
    const reading = await widths(page);
    expect(reading.clientWidth, `${frame.name}: containing block`).toBe(frame.width);
    expect(reading.innerWidth, `${frame.name}: layout viewport`).toBe(reading.clientWidth);
    expect(reading.bodyScrollWidth, `${frame.name}: body`).toBeLessThanOrEqual(reading.innerWidth);
    expect(reading.documentScrollWidth, `${frame.name}: document`).toBeLessThanOrEqual(reading.innerWidth);
  }
}

test('a page nobody has touched fits the frame it is dropped into', async ({ page }) => {
  await openAtDesk(page);
  await checkFrames(page, async () => {});
});

test('the foot of the page fits the frame', async ({ page }) => {
  await openAtDesk(page);
  await checkFrames(page, async () => {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1200);
  });
});

for (let lane = 0; lane < LANES; lane += 1) {
  test(`the stacks in lane ${lane} fit the frame mid-turn and once they have settled`, async ({ page }) => {
    await forEachStackInLane(page, lane, openAtDesk, async (page, stack) => {
      await stack.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1200);
      await stack.focus();

      // The gesture happens at desk width: what this is watching for is state carried across
      // the switch, not state built up inside an emulated frame.
      await settledAfter(stack, async () => {
        await page.keyboard.press('ArrowRight');
        await checkFrames(page, async () => {
          await page.waitForTimeout(200);
        });
        await page.setViewportSize(DESKTOP);
      });
      await checkFrames(page, async () => {});
    });
  });

  test(`the stacks in lane ${lane} fit the frame with the fold held open`, async ({ page }) => {
    await forEachStackInLane(page, lane, openAtDesk, async (page, stack) => {
      await stack.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1200);
      const box = await stack.boundingBox();
      expect(box).not.toBeNull();
      const grab = await flapPoint(stack);

      // The flap's own box is the page's, mirrored across the crease, so a deep fold throws it
      // hundreds of pixels past the page, invisibly but not weightlessly.
      await checkFrames(page, async () => {
        await page.mouse.move(grab.x, grab.y);
        await page.mouse.down();
        for (let step = 1; step <= 8; step += 1) {
          await page.mouse.move(grab.x - (box!.width * 0.5 * step) / 8, grab.y - (box!.height * 0.3 * step) / 8);
          await page.waitForTimeout(25);
        }
        await page.waitForTimeout(150);
      });
      await page.mouse.up();
    });
  });

  test(`the stacks in lane ${lane} fit the frame with a swipe in flight`, async ({ page }) => {
    await forEachStackInLane(page, lane, openAtDesk, async (page, stack) => {
      await stack.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1200);
      const box = await stack.boundingBox();
      expect(box).not.toBeNull();

      await checkFrames(page, async () => {
        await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
        const travel = Math.hypot(box!.width, box!.height) * 0.4;
        for (let step = 0; step < 8; step += 1) {
          await page.mouse.wheel(travel / 8, 0);
          await page.waitForTimeout(30);
        }
        await page.waitForTimeout(150);
      });
    });
  });
}

test('a theme change mid-transition fits the frame', async ({ page }) => {
  await openAtDesk(page);
  const choices = page.locator('#theme-picker input[type="radio"]');
  const count = await choices.count();
  expect(count).toBeGreaterThan(0);
  await checkFrames(page, async () => {
    await choices.nth(count - 1).evaluate((input) => (input as HTMLInputElement).click());
    await page.waitForTimeout(120);
  });
});

test('the theme picker under the pointer fits the frame', async ({ page }) => {
  await openAtDesk(page);
  await checkFrames(page, async () => {
    await page.locator('#theme-picker').hover({ force: true });
    await page.waitForTimeout(600);
  });
});

test('every island booted at desk width fits the frame', async ({ page }) => {
  await openAtDesk(page);
  await checkFrames(page, async () => {
    const height = await page.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y < height; y += 600) {
      await page.evaluate((to) => window.scrollTo(0, to), y);
      await page.waitForTimeout(200);
    }
    await page.waitForTimeout(2000);
  });
});
