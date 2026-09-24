import { expect, test, type Page } from '@playwright/test';

import { frontPage, frontPageIndex, frontPageName, swipeStack } from './support/paperStack';

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

/** Waits out the token's run: the answer lands once it reaches the return. A run is a few
    seconds of timers, which a crowded box stretches, hence the margin. */
async function settled(bus: import('@playwright/test').Locator) {
  await expect(bus).not.toHaveAttribute('data-result', 'pending', { timeout: 20_000 });
}

function listener(bus: import('@playwright/test').Locator, module: string) {
  return bus.locator(`.listener[data-module="${module}"]`);
}

test('event bus: forward swipes visit every page in order, then wrap', async ({ page }) => {
  await page.goto('/');
  const stack = eventBusStack(page);
  await stack.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  expect(await stack.locator(':scope > div').count()).toBe(PAGES.length);
  expect(await frontPageName(stack)).toBe(PAGES[0]);

  for (let i = 1; i < PAGES.length; i += 1) {
    await swipeStack(page, stack, true);
    expect(await frontPageName(stack), `page ${i} after ${i} forward swipe(s)`).toBe(PAGES[i]);
  }

  await swipeStack(page, stack, true);
  expect(await frontPageName(stack)).toBe(PAGES[0]);
});

test('main page: the walkthrough plays, then hands over on hover', async ({ page }) => {
  test.slow();
  await page.goto('/');
  const { front, bus } = await mountedBus(page);

  await expect(bus).toHaveAttribute('data-autoplay-state', 'playing');
  // The token goes out: a run is seen in flight before it settles on ImageEncoder's stop.
  await expect(bus).toHaveAttribute('data-result', 'pending', { timeout: 20_000 });
  await expect(front.locator('.token')).toBeVisible();
  await settled(bus);
  await expect(listener(bus, 'ImageEncoder')).toHaveAttribute('data-result', 'stop');
  await expect(front.locator('.event-bus-cursor')).toBeVisible({ timeout: 20_000 });

  await bus.hover();
  await expect(bus).toHaveAttribute('data-autoplay-state', 'user');
  await expect(front.locator('.event-bus-cursor')).toBeHidden();

  // Handover means handover: once the last run lands, nothing changes on its own.
  await settled(bus);
  const state = await bus.evaluate((el) => [el.dataset.result, el.dataset.rendered, el.dataset.attachment].join());
  await page.waitForTimeout(3_000);
  expect(await bus.evaluate((el) => [el.dataset.result, el.dataset.rendered, el.dataset.attachment].join())).toBe(state);
});

test('main page: switching plugins re-runs the chain and moves the claim', async ({ page }) => {
  // Five dispatches in a row, each waited out.
  test.slow();
  await page.goto('/');
  const { bus } = await mountedBus(page);
  await bus.hover();
  await expect(bus).toHaveAttribute('data-autoplay-state', 'user');
  await settled(bus);

  // Start from the page's own state, whatever the walkthrough left behind.
  for (const module of ['Embed', 'ImageEncoder', 'VideoEncoder']) {
    const toggle = listener(bus, module).locator('.load');
    if ((await toggle.getAttribute('aria-pressed')) === 'false') {
      await toggle.click();
      await settled(bus);
    }
  }
  await bus.locator('.attachment[data-attachment="jpeg"]').click();
  await settled(bus);
  await expect(bus).toHaveAttribute('data-rendered', 'image');
  await expect(listener(bus, 'VideoEncoder')).toHaveAttribute('data-result', 'skipped');

  // ImageEncoder off: it leaves the rail for the tray, nobody claims the JPEG, and the
  // emitter's own default branch renders a link.
  await listener(bus, 'ImageEncoder').locator('.load').click();
  await expect(bus.locator('.tray .listener[data-module="ImageEncoder"]')).toHaveCount(1);
  await settled(bus);
  await expect(bus).toHaveAttribute('data-result', 'unhandled');
  await expect(bus).toHaveAttribute('data-rendered', 'link');
  await expect(bus.locator('.branch')).toHaveAttribute('data-taken', 'true');

  // The GIF: VideoEncoder takes image/gif, and with ImageEncoder gone it is first to.
  await bus.locator('.attachment[data-attachment="gif"]').click();
  await settled(bus);
  await expect(listener(bus, 'VideoEncoder')).toHaveAttribute('data-result', 'stop');
  await expect(listener(bus, 'VideoEncoder').locator('.result')).toHaveText('stop');
  await expect(bus).toHaveAttribute('data-rendered', 'video');
  await expect(bus.locator('.branch')).toHaveAttribute('data-taken', 'false');

  // ImageEncoder back on: it is ahead in discovery order, so it claims the GIF and
  // VideoEncoder never hears the event.
  await listener(bus, 'ImageEncoder').locator('.load').click();
  await expect(bus.locator('.chain .listener').nth(1)).toHaveAttribute('data-module', 'ImageEncoder');
  await settled(bus);
  await expect(listener(bus, 'ImageEncoder')).toHaveAttribute('data-result', 'stop');
  await expect(listener(bus, 'VideoEncoder')).toHaveAttribute('data-result', 'skipped');
  await expect(listener(bus, 'VideoEncoder').locator('.result')).toHaveText('skipped');
  await expect(bus).toHaveAttribute('data-rendered', 'image');
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
