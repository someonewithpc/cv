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

  test('main page: the walkthrough shows the GIF, one event at a time', async ({ page, walkthroughRate }) => {
    const rate = walkthroughRate;
    await page.goto('/');
    const { bus } = await mountedBus(page);
    await expect(bus).toHaveAttribute('data-autoplay-state', 'playing');

    // Six steps in: the GIF on ViewAttachment, which ImageEncoder claims. Each step is a press,
    // a dispatch down the chain and a hold, so the six take about 6 * (STEP_MS + RUN_MS) of page
    // time. The cursor's hops and the token's run wait on frames, which a loaded machine hands
    // out slowly, so the wait allows twice that. It checks the order of the steps, not their pace.
    await expect(bus).toHaveAttribute('data-attachment', 'gif', within(2 * 6 * (STEP_MS + RUN_MS), rate));
    await expect(bus).toHaveAttribute('data-stage', 'view');
    await expect(bus).toHaveAttribute('data-rendered', 'image', within(RUN_MS, rate));

    // Then FileResizerAvailable, with VideoEncoder's resizer first.
    await expect(bus).toHaveAttribute('data-stage', 'resize', within(2 * STEP_MS, rate));
    await expect(bus).toHaveAttribute('data-rendered', 'event-map', within(RUN_MS, rate));
    await expect(resizer(bus, 'VideoEncoder')).toHaveAttribute('data-result', 'true');
    await expect(resizer(bus, 'ImageEncoder')).toHaveAttribute('data-result', 'unused');

    // Then VideoEncoder off, and ImageEncoder's resizer makes the thumbnail.
    await expect(bus).toHaveAttribute('data-thumbnail', 'ImageEncoder', within(2 * STEP_MS, rate));
    await expect(bus).toHaveAttribute('data-stage', 'resize');
    await expect(bus.locator('.tray .listener[data-module="VideoEncoder"]')).toHaveCount(1);
    await expect(resizer(bus, 'VideoEncoder')).toHaveAttribute('data-result', 'off');
    await expect(resizer(bus, 'ImageEncoder')).toHaveAttribute('data-result', 'true');
  });
});

test('main page: reduced motion stands the walkthrough down and answers at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const { front, bus } = await mountedBus(page);

  await expect(bus).toHaveAttribute('data-autoplay-state', 'paused');
  await expect(front.locator('.event-bus-cursor')).toBeHidden();

  await listener(bus, 'ImageEncoder').locator('.load').click();
  // No run in flight to wait out: the answer is there on the next frame.
  await expect(bus).toHaveAttribute('data-rendered', 'link', { timeout: 500 });
});

function resizer(bus: Locator, module: string) {
  return bus.locator(`.resizer[data-module="${module}"]`);
}

// The GIF raises two events, and the sheet shows one at a time. On ViewAttachment it is an
// image like any other. FileResizerAvailable is the thumbnail request inside ImageEncoder's view:
// every module handler is added at priority 0, so the order of the GIF's resizers comes from
// the core, which puts $event_map['image/gif'] ahead of $event_map['image'].
test('main page: the GIF shows one event at a time, the specific resizer first', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const { bus } = await mountedBus(page);
  const stage = (name: string) => bus.locator(`.stage[data-stage="${name}"]`);

  // Only the GIF has the second event.
  await expect(bus.locator('.stages')).toBeHidden();
  await bus.locator('.attachment[data-attachment="gif"]').click();
  await expect(bus).toHaveAttribute('data-attachment', 'gif');
  await expect(bus.locator('.stages')).toBeVisible();
  await expect(stage('view')).toHaveAttribute('aria-pressed', 'true');

  // ViewAttachment: ImageEncoder takes it, VideoEncoder never hears it, and nothing on the
  // sheet speaks of resizers.
  await expect(bus.locator('.call code:visible')).toContainText("'ViewAttachment'");
  await expect(listener(bus, 'ImageEncoder')).toHaveAttribute('data-result', 'stop');
  await expect(listener(bus, 'VideoEncoder')).toHaveAttribute('data-result', 'skipped');
  await expect(bus).toHaveAttribute('data-rendered', 'image');
  await expect(bus.locator('.res figcaption span:visible')).toHaveText('$res');
  await expect(bus.locator('.rendered[data-kind="image"]')).toHaveText(/ImageEncoder/);
  await expect(bus.locator('.rendered[data-kind="image"]')).not.toHaveText(/VideoEncoder|thumbnail/);
  await expect(bus.locator('.branch')).toBeVisible();
  await expect(bus.locator('.resize')).toBeHidden();
  await expect(bus.locator('.chain .listener .meta')).toHaveText(['prio 0', 'prio 0', 'prio 0']);

  // FileResizerAvailable: AudioEncoder has no handler for it, the two encoders each add a
  // resizer and answer next, and the box is the $event_map they filled.
  await stage('resize').click();
  await expect(bus).toHaveAttribute('data-stage', 'resize');
  await expect(stage('resize')).toHaveAttribute('aria-pressed', 'true');
  await expect(bus.locator('.call code:visible')).toContainText("'FileResizerAvailable'");
  await expect(bus.locator('.chain .listener:visible')).toHaveCount(2);
  await expect(listener(bus, 'AudioEncoder')).toBeHidden();
  await expect(listener(bus, 'ImageEncoder')).toHaveAttribute('data-result', 'next');
  await expect(listener(bus, 'VideoEncoder')).toHaveAttribute('data-result', 'next');
  await expect(bus.locator('.returned')).toHaveText('next');
  await expect(bus).toHaveAttribute('data-rendered', 'event-map');
  await expect(bus.locator('.res figcaption span:visible')).toHaveText('$event_map');
  await expect(bus.locator('.event-map .entry')).toHaveText(["'image/gif' => [VideoEncoder]", "'image' => [ImageEncoder]"]);
  await expect(bus.locator('.rendered:visible')).toHaveCount(0);
  await expect(bus.locator('.branch')).toBeHidden();

  await expect(bus.locator('.resize')).toBeVisible();
  await expect(bus.locator('.resize-note')).toBeVisible();
  await expect(bus.locator('.resizer')).toHaveCount(2);
  await expect(bus.locator('.resizer').nth(0)).toHaveAttribute('data-module', 'VideoEncoder');
  await expect(bus.locator('.resizer').nth(1)).toHaveAttribute('data-module', 'ImageEncoder');
  await expect(resizer(bus, 'VideoEncoder')).toHaveAttribute('data-result', 'true');
  await expect(resizer(bus, 'VideoEncoder').locator('.answer')).toHaveText('true');
  await expect(resizer(bus, 'ImageEncoder')).toHaveAttribute('data-result', 'unused');
  await expect(resizer(bus, 'ImageEncoder').locator('.answer')).toHaveText('not called');

  // VideoEncoder off: its list stays empty and ImageEncoder's resizer makes the thumbnail.
  await listener(bus, 'VideoEncoder').locator('.load').click();
  await expect(bus.locator('.tray .listener[data-module="VideoEncoder"]')).toHaveCount(1);
  await expect(bus.locator('.chain .listener:visible')).toHaveCount(1);
  await expect(bus.locator('.event-map .entry').nth(0)).toHaveAttribute('data-on', 'false');
  await expect(bus.locator('.event-map .entry').nth(0).locator('.callable')).toBeHidden();
  await expect(resizer(bus, 'VideoEncoder')).toHaveAttribute('data-result', 'off');
  await expect(resizer(bus, 'ImageEncoder')).toHaveAttribute('data-result', 'true');
  await expect(bus).toHaveAttribute('data-thumbnail', 'ImageEncoder');

  // Back on, it is first again.
  await bus.locator('.tray .listener[data-module="VideoEncoder"] .load').click();
  await expect(resizer(bus, 'VideoEncoder')).toHaveAttribute('data-result', 'true');
  await expect(bus).toHaveAttribute('data-thumbnail', 'VideoEncoder');

  // Another file goes back to ViewAttachment, with AudioEncoder on the rail again.
  await bus.locator('.attachment[data-attachment="jpeg"]').click();
  await expect(bus).toHaveAttribute('data-stage', 'view');
  await expect(bus.locator('.stages')).toBeHidden();
  await expect(bus.locator('.chain .listener:visible')).toHaveCount(3);
  await expect(bus).toHaveAttribute('data-rendered', 'image');
});

/** How far each answer pill's word sits from the pill's middle, in px: the x-height band
    up and down, since the answers are lowercase, and the ink across. */
function labelOffsets(pills: Locator) {
  return pills.evaluateAll((pills) => {
    const ctx = document.createElement('canvas').getContext('2d')!;
    return pills.map((pill) => {
      const style = getComputedStyle(pill);
      const box = pill.getBoundingClientRect();
      const text = pill.textContent!.trim();
      const range = document.createRange();
      range.selectNodeContents(pill);
      const start = range.getBoundingClientRect().left;
      const probe = document.createElement('span');
      probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
      pill.append(probe);
      const baseline = probe.getBoundingClientRect().top;
      probe.remove();
      ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const ink = ctx.measureText(text);
      const xHeight = ctx.measureText('x').actualBoundingBoxAscent;
      const top = box.top + parseFloat(style.borderTopWidth);
      const bottom = box.bottom - parseFloat(style.borderBottomWidth);
      return {
        text,
        across: start + (ink.actualBoundingBoxRight - ink.actualBoundingBoxLeft) / 2 - (box.left + box.right) / 2,
        down: baseline - xHeight / 2 - (top + bottom) / 2,
      };
    });
  });
}

for (const width of [390, 1024, 1440]) {
  test(`main page: the answers sit in the middle of their pills at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const { bus } = await mountedBus(page);

    const chain = await labelOffsets(bus.locator('.chain .result'));
    expect(chain.map(({ text }) => text)).toEqual(['next', 'stop', 'skipped']);
    await bus.locator('.attachment[data-attachment="gif"]').click();
    await bus.locator('.stage[data-stage="resize"]').click();
    await expect(bus).toHaveAttribute('data-rendered', 'event-map');
    const gif = await labelOffsets(bus.locator('.resizer .answer'));
    expect(gif.map(({ text }) => text)).toEqual(['true', 'not called']);
    for (const { text, across, down } of [...chain, ...gif]) {
      expect(Math.abs(across), `"${text}" across`).toBeLessThanOrEqual(1);
      expect(Math.abs(down), `"${text}" up and down`).toBeLessThanOrEqual(1);
    }
  });
}

/** How far the demo's boxes reach past the sheet's frame line, and how much of the title block
    the smallest of them cover, in px. */
async function sheetOverflow(front: Locator) {
  return front.locator('section').evaluate((sheet) => {
    const s = sheet.getBoundingClientRect();
    const inset = parseFloat(getComputedStyle(sheet).paddingTop) + 2;
    const block = sheet.querySelector(':scope > table')!.getBoundingClientRect();
    let past = -Infinity;
    let under = 0;
    for (const el of sheet.querySelectorAll('.event-bus-demo *')) {
      if (!el.checkVisibility() || el.closest('.event-bus-cursor')) continue;
      const b = el.getBoundingClientRect();
      if (b.width < 1 || b.height < 1) continue;
      past = Math.max(past, b.bottom - (s.bottom - inset), b.right - (s.right - inset), s.left + inset - b.left, s.top + inset - b.top);
      if ([...el.children].some((child) => child.getBoundingClientRect().width > 0)) continue;
      const across = Math.min(b.right, block.right) - Math.max(b.left, block.left);
      const down = Math.min(b.bottom, block.bottom) - Math.max(b.top, block.top);
      if (across > 0.5 && down > 0.5) under = Math.max(under, across * down);
    }
    return { past, under };
  });
}

for (const width of [688, 720, 768]) {
  test(`main page: a narrow landscape sheet holds every stage inside its frame at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const { front, bus } = await mountedBus(page);
    const answered = { timeout: 15_000 };

    const check = async (state: string) => {
      await expect(bus).not.toHaveAttribute('data-result', 'pending', answered);
      const { past, under } = await sheetOverflow(front);
      expect(past, `${state}: past the frame line`).toBeLessThanOrEqual(0);
      expect(under, `${state}: under the title block`).toBe(0);
    };

    await check('the JPEG');
    await bus.locator('.attachment[data-attachment="gif"]').click();
    await check('the GIF');
    await bus.locator('.stage[data-stage="resize"]').click();
    await expect(bus).toHaveAttribute('data-rendered', 'event-map', answered);
    await check('the thumbnail');
    await bus.locator('.attachment[data-attachment="jpeg"]').click();
    for (const module of ['AudioEncoder', 'ImageEncoder']) {
      await bus.locator(`.chain .listener[data-module="${module}"] .load`).click();
      await check(`${module} off`);
    }
  });
}
