import { test as base, type Page } from '@playwright/test';

// Runs the page's clock `rate` times faster than the wall clock (or slower, below 1), so a
// walkthrough that takes a minute plays out in a fraction of it. Timers, performance.now,
// Date.now and event timestamps are scaled by an init script, and CSS and Web Animations by
// CDP's Animation.setPlaybackRate, which scales requestAnimationFrame's timestamps with them,
// so a cursor hop still ends when the step's timer expects it to. Frames still come at the
// display's rate, and React still renders as soon as it can, so work that waits on a frame
// or a render takes `rate` times more page time than it would. Network and Playwright's
// own timeouts stay on the wall clock.
export async function scaleTime(page: Page, rate: number): Promise<void> {
  await page.addInitScript((k: number) => {
    const w = window as Window & { __timeScale?: number };
    if (w.__timeScale) return;
    w.__timeScale = k;

    const now = performance.now.bind(performance);
    performance.now = () => now() * k;

    const RealDate = Date;
    const dateNow = RealDate.now;
    const dateBase = dateNow();
    const scaledNow = () => dateBase + (dateNow() - dateBase) * k;
    class ScaledDate extends RealDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) super(scaledNow());
        else super(...(args as [number]));
      }

      static now() {
        return scaledNow();
      }
    }
    window.Date = ScaledDate as DateConstructor;

    const stamp = Object.getOwnPropertyDescriptor(Event.prototype, 'timeStamp')!;
    Object.defineProperty(Event.prototype, 'timeStamp', {
      configurable: true,
      get() {
        return (stamp.get!.call(this) as number) * k;
      },
    });

    const later = window.setTimeout.bind(window);
    const every = window.setInterval.bind(window);
    window.setTimeout = ((handler: TimerHandler, delay = 0, ...args: unknown[]) =>
      later(handler, Number(delay) / k, ...args)) as typeof window.setTimeout;
    window.setInterval = ((handler: TimerHandler, delay = 0, ...args: unknown[]) =>
      every(handler, Number(delay) / k, ...args)) as typeof window.setInterval;
  }, rate);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Animation.enable');
  await cdp.send('Animation.setPlaybackRate', { playbackRate: rate });
}

/** Waits `ms` on the page's own clock, however fast `scaleTime` runs it. */
export async function pageWait(page: Page, ms: number): Promise<void> {
  await page.evaluate((wait) => new Promise((resolve) => window.setTimeout(resolve, wait)), ms);
}

/** The pace the slow-walkthroughs project plays every `@handover` test at. */
export const SLOW_RATE = 0.5;

export type PaceOptions = {
  /** How many times faster than real time the page runs; set with `test.use()`. */
  walkthroughRate: number;
  /** Set by the slow-walkthroughs project, which plays every page at SLOW_RATE instead. */
  slowWalkthroughs: boolean;
};

// Specs that sit and watch a walkthrough import `test` from here and speed it up with
// `test.use({ walkthroughRate })` in a describe around those tests. The hand-over tests
// carry the @handover tag, and the slow-walkthroughs project runs them again at half speed,
// where each step's awaits last longer and a takeover is likelier to land inside one.
export const test = base.extend<PaceOptions>({
  walkthroughRate: [1, { option: true }],
  slowWalkthroughs: [false, { option: true }],
  page: async ({ page, walkthroughRate, slowWalkthroughs }, use) => {
    const rate = slowWalkthroughs ? SLOW_RATE : walkthroughRate;
    if (rate !== 1) await scaleTime(page, rate);
    await use(page);
  },
});

export { expect } from '@playwright/test';
