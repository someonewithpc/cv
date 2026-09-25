import type { Locator, Page } from '@playwright/test';

import { frontPage, frontPageIndex, frontPageName, swipeStack } from './support/paperStack';
import { expect, pageWait, SLOW_RATE, test } from './support/timeScale';

const PAGES = ['GNU social · Event Dispatch', 'EventResult', 'Module Discovery', 'Build-Time Guard'];

function eventBusStack(page: Page) {
  // By title, not by position: the demos run gains stacks over time.
  return page.locator('article.technical-drawing-stack').filter({
    has: page.locator('h2.typewriter', { hasText: 'GNU social · Event Dispatch' }),
  });
}

async function mountedBus(page: Page) {
  const stack = eventBusStack(page);
  await stack.scrollIntoViewIfNeeded();
  const front = frontPage(stack, await frontPageIndex(stack));
  await expect(front.locator('.event-bus-demo')).toHaveAttribute('data-mounted', 'true', { timeout: 15_000 });
  const bus = front.locator('.event-bus[data-live]');
  await expect(bus).toHaveAttribute('data-ready', 'true');
  return { stack, front, bus };
}

/** A dispatch down the whole chain, about 3 s of page time, and the walkthrough's longest
    step, a 2.8 s hold and the cursor's move to the next control. */
const RUN_MS = 3_000;
const STEP_MS = 4_000;

/** Page time as a wall-clock expect timeout at the pace this test plays at. */
function within(pageMs: number, rate: number) {
  return { timeout: pageMs / rate + 5_000 };
}

/** Waits out the token's run: the answer lands once it reaches the return. */
async function settled(bus: Locator, rate: number) {
  await expect(bus).not.toHaveAttribute('data-result', 'pending', within(RUN_MS, rate));
}

function listener(bus: Locator, module: string) {
  return bus.locator(`.listener[data-module="${module}"]`);
}

test('event bus: forward swipes visit every page in order, then wrap', async ({ page }) => {
  await page.goto('/');
  const stack = eventBusStack(page);
  await stack.scrollIntoViewIfNeeded();
  // fold-drag.ts sets the role description as it wires the stack, wheel listener included.
  await expect(stack).toHaveAttribute('aria-roledescription', 'paper stack');

  await expect(stack.locator(':scope > div')).toHaveCount(PAGES.length);
  expect(await frontPageName(stack)).toBe(PAGES[0]);

  for (let i = 1; i < PAGES.length; i += 1) {
    await swipeStack(page, stack, true);
    expect(await frontPageName(stack), `page ${i} after ${i} forward swipe(s)`).toBe(PAGES[i]);
  }

  await swipeStack(page, stack, true);
  expect(await frontPageName(stack)).toBe(PAGES[0]);
});

test.describe(() => {
  // A run is 3 s of timers and a walkthrough step up to 4 s; at four times the pace the
  // tests below take seconds, where they took most of a minute at real speed.
  test.use({ walkthroughRate: 4 });

  test('main page: the walkthrough plays, then hands over on hover', { tag: '@handover' }, async ({ page, walkthroughRate, slowWalkthroughs }) => {
    const rate = slowWalkthroughs ? SLOW_RATE : walkthroughRate;
    await page.goto('/');
    const { front, bus } = await mountedBus(page);

    await expect(bus).toHaveAttribute('data-autoplay-state', 'playing');
    // The token goes out: a run is seen in flight before it settles on ImageEncoder's stop.
    await expect(bus).toHaveAttribute('data-result', 'pending', within(RUN_MS, rate));
    await expect(front.locator('.token')).toBeVisible();
    await settled(bus, rate);
    await expect(listener(bus, 'ImageEncoder')).toHaveAttribute('data-result', 'stop');
    await expect(front.locator('.event-bus-cursor')).toBeVisible(within(STEP_MS, rate));

    await bus.hover();
    await expect(bus).toHaveAttribute('data-autoplay-state', 'user');
    await expect(front.locator('.event-bus-cursor')).toBeHidden();

    // Handover means handover: once the last run lands, a whole walkthrough step goes by
    // on the page's clock and nothing changes on its own.
    await settled(bus, rate);
    const state = () => bus.evaluate((el) => [el.dataset.result, el.dataset.rendered, el.dataset.attachment].join());
    const before = await state();
    await pageWait(page, STEP_MS);
    expect(await state()).toBe(before);
  });

  test('main page: switching plugins re-runs the chain and moves the claim', async ({ page, walkthroughRate }) => {
    const rate = walkthroughRate;
    await page.goto('/');
    const { bus } = await mountedBus(page);
    await bus.hover();
    await expect(bus).toHaveAttribute('data-autoplay-state', 'user');
    await settled(bus, rate);

    // Start from the page's own state, whatever the walkthrough left behind.
    for (const module of ['AudioEncoder', 'ImageEncoder', 'VideoEncoder']) {
      const toggle = listener(bus, module).locator('.load');
      if ((await toggle.getAttribute('aria-pressed')) === 'false') {
        await toggle.click();
        await settled(bus, rate);
      }
    }
    await bus.locator('.attachment[data-attachment="jpeg"]').click();
    await settled(bus, rate);
    await expect(bus).toHaveAttribute('data-rendered', 'image');
    await expect(listener(bus, 'AudioEncoder')).toHaveAttribute('data-result', 'next');
    await expect(listener(bus, 'VideoEncoder')).toHaveAttribute('data-result', 'skipped');

    // ImageEncoder off: it leaves the rail for the tray, the two encoders left both answer
    // next, and the template's own branch renders a link.
    await listener(bus, 'ImageEncoder').locator('.load').click();
    await expect(bus.locator('.tray .listener[data-module="ImageEncoder"]')).toHaveCount(1);
    await settled(bus, rate);
    await expect(bus).toHaveAttribute('data-result', 'next');
    await expect(bus).toHaveAttribute('data-rendered', 'link');
    await expect(bus.locator('.branch')).toHaveAttribute('data-taken', 'true');

    // The MP4: AudioEncoder passes, VideoEncoder claims it.
    await bus.locator('.attachment[data-attachment="mp4"]').click();
    await settled(bus, rate);
    await expect(listener(bus, 'AudioEncoder')).toHaveAttribute('data-result', 'next');
    await expect(listener(bus, 'VideoEncoder')).toHaveAttribute('data-result', 'stop');
    await expect(listener(bus, 'VideoEncoder').locator('.result')).toHaveText('stop');
    await expect(bus).toHaveAttribute('data-rendered', 'video');
    await expect(bus.locator('.branch')).toHaveAttribute('data-taken', 'false');

    // ImageEncoder back on: it is ahead of VideoEncoder in discovery order, but video is not
    // its job, so it answers next and VideoEncoder still claims the MP4.
    await listener(bus, 'ImageEncoder').locator('.load').click();
    await expect(bus.locator('.chain .listener').nth(1)).toHaveAttribute('data-module', 'ImageEncoder');
    await settled(bus, rate);
    await expect(listener(bus, 'ImageEncoder')).toHaveAttribute('data-result', 'next');
    await expect(listener(bus, 'VideoEncoder')).toHaveAttribute('data-result', 'stop');
    await expect(bus).toHaveAttribute('data-rendered', 'video');

    // The JPEG again: ImageEncoder claims it and VideoEncoder never hears the event.
    await bus.locator('.attachment[data-attachment="jpeg"]').click();
    await settled(bus, rate);
    await expect(listener(bus, 'ImageEncoder')).toHaveAttribute('data-result', 'stop');
    await expect(listener(bus, 'VideoEncoder')).toHaveAttribute('data-result', 'skipped');
    await expect(listener(bus, 'VideoEncoder').locator('.result')).toHaveText('skipped');
    await expect(bus).toHaveAttribute('data-rendered', 'image');
  });
});

test('main page: reduced motion stands the walkthrough down and answers at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const { front, bus } = await mountedBus(page);

  await expect(bus).toHaveAttribute('data-autoplay-state', 'off');
  await expect(front.locator('.event-bus-cursor')).toBeHidden();

  await listener(bus, 'ImageEncoder').locator('.load').click();
  // No run in flight to wait out: the answer is there on the next frame.
  await expect(bus).toHaveAttribute('data-rendered', 'link', { timeout: 500 });
});
