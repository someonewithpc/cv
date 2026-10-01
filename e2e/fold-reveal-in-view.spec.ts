import { expect, test, type Locator } from '@playwright/test';

import { demoStack } from './support/paperStack';

/**
 * A stack's dog-ear draws itself once (initial-fold-reveal in PaperStack/index.astro) and then
 * breathes (the fold pulse). Both used to start at load, so on a stack further down the page
 * they had played out long before anyone scrolled to it. They now wait until the stack's
 * bottom edge, where the dog-ear is, comes on screen (watchStackReveal in fold-drag.ts), and
 * the pulse only comes in once the reveal is over: while the page's clip-path pulse exists,
 * Chrome paints the page's crease cut where it stood when that animation started, so the flap
 * drew itself over an uncut corner.
 */
async function foldState(stack: Locator): Promise<{ reveal: string, pulses: string[], flap: number, flapOpacity: string }> {
  return stack.evaluate((el) => {
    const front = el.querySelector<HTMLElement>('.paper-front')!;
    const animations = front.getAnimations({ subtree: true }) as CSSAnimation[];
    const reveal = animations.find((animation) => animation.animationName === 'initial-fold-reveal');
    return {
      reveal: reveal ? `${reveal.playState} at ${Math.round(Number(reveal.currentTime))}` : 'none',
      pulses: animations
        .filter((animation) => animation.animationName?.startsWith('fold-pulse-'))
        .map((animation) => animation.playState),
      flap: front.querySelector<HTMLElement>(':scope > .paper-fold')!.getBoundingClientRect().width,
      flapOpacity: getComputedStyle(front.querySelector(':scope > .paper-fold')!).opacity,
    };
  });
}

type RevealFrame = { progress: number | null, spread: number, pulses: number, flapOpacity: string };

/**
 * Every frame from now until the reveal has finished: its progress, how far apart the fold
 * size the page, the flap and the cast shadow each draw with is, and how many pulse animations
 * the front page has.
 */
async function revealFrames(stack: Locator): Promise<RevealFrame[]> {
  return stack.evaluate((el) => new Promise<RevealFrame[]>((resolve) => {
    const front = el.querySelector<HTMLElement>('.paper-front')!;
    const layers: [Element, string | null][] = [
      [front.querySelector(':scope > :not(.paper-fold, .paper-back-grab, .paper-clip, .paper-clip-under, .paper-flip-hint)')!, null],
      [front.querySelector(':scope > .paper-fold')!, null],
      [front.querySelector(':scope > .paper-clip')!, '::after'],
    ];
    const frames: RevealFrame[] = [];
    const sample = () => {
      const animations = front.getAnimations({ subtree: true }) as CSSAnimation[];
      const reveal = animations.find((animation) => animation.animationName === 'initial-fold-reveal');
      const sizes = layers.map(([layer, pseudo]) => parseFloat(getComputedStyle(layer, pseudo).getPropertyValue('--fold-x')));
      frames.push({
        progress: reveal ? reveal.effect!.getComputedTiming().progress ?? null : null,
        spread: Math.max(...sizes) - Math.min(...sizes),
        pulses: animations.filter((animation) => animation.animationName?.startsWith('fold-pulse-')).length,
        flapOpacity: getComputedStyle(layers[1][0]).opacity,
      });
      if (reveal?.playState === 'finished' || frames.length > 600) resolve(frames);
      else requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }));
}

/** Scrolls so the stack's bottom edge sits `below` px under the bottom of the window. */
async function bottomEdgeBelowWindow(stack: Locator, below: number): Promise<void> {
  await stack.evaluate((el, below) => {
    const bottom = el.getBoundingClientRect().bottom + window.scrollY;
    window.scrollTo({ top: bottom - window.innerHeight - below, behavior: 'instant' });
  }, below);
}

test('a stack far down the page reveals its dog-ear only once its corner is on screen', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  const stack = page.locator('article.technical-drawing-stack').last();

  // Long past the half second the reveal waits and the half second it runs.
  await page.waitForTimeout(2500);
  const waiting = await foldState(stack);
  expect(waiting.reveal).toBe('paused at 0');
  expect(waiting.pulses).toEqual([]);
  // Only the flap's 1px border on each side: the fold is still 0 by 0, and that border would
  // paint a dot on the sheet's corner.
  expect(waiting.flap).toBeLessThan(3);
  expect(waiting.flapOpacity).toBe('0');

  // Most of the stack in view, but not the corner the dog-ear is in.
  await bottomEdgeBelowWindow(stack, 120);
  await page.waitForTimeout(1500);
  expect((await foldState(stack)).reveal).toBe('paused at 0');

  await bottomEdgeBelowWindow(stack, -40);
  const frames = await revealFrames(stack);
  const drawing = frames.filter((frame) => frame.progress !== null && frame.progress > 0 && frame.progress < 1);
  expect(drawing.length, 'no frame caught the dog-ear part drawn').toBeGreaterThan(0);
  // The page's cut, the flap and its shadow grow as one, and no pulse is there to hold the cut.
  expect(Math.max(...frames.map((frame) => frame.spread))).toBe(0);
  expect(drawing.map((frame) => frame.pulses)).toEqual(drawing.map(() => 0));
  expect(drawing.map((frame) => frame.flapOpacity)).toEqual(drawing.map(() => '1'));
  expect((await foldState(stack)).reveal).toBe('finished at 1000');
  await expect.poll(async () => (await foldState(stack)).pulses, { timeout: 2_000 }).toEqual(['running', 'running', 'running']);
  const shown = await foldState(stack);
  // 2cm across at rest.
  expect(shown.flap).toBeGreaterThan(70);
});

type TurnFrame = { page: number, progress: number, pulses: number };

test('a page turned to the front by key draws its dog-ear with no pulse under it', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  const stack = demoStack(page, 'Visrez Animated Loading Logo');
  await stack.scrollIntoViewIfNeeded();
  await expect.poll(async () => (await foldState(stack)).pulses, { timeout: 5_000 }).toEqual(['running', 'running', 'running']);

  // Every frame of the turns, read in the page and fetched afterwards, so the key presses are
  // not held up behind a pending evaluate().
  await stack.evaluate((el) => {
    const frames: TurnFrame[] = [];
    (window as Window & { turnFrames?: TurnFrame[] }).turnFrames = frames;
    const sample = () => {
      const front = el.querySelector<HTMLElement>('.paper-front')!;
      const animations = front.getAnimations({ subtree: true }) as CSSAnimation[];
      const reveal = animations.find((animation) => animation.animationName === 'initial-fold-reveal');
      frames.push({
        page: [...el.children].indexOf(front),
        progress: reveal?.effect!.getComputedTiming().progress ?? -1,
        pulses: animations.filter((animation) => animation.animationName?.startsWith('fold-pulse-')).length,
      });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });

  // Quick turns, the way the dog-ear was first seen drawn over an uncut corner: each page
  // reveals its dog-ear as it comes to the front.
  await stack.focus();
  for (let turn = 0; turn < 3; turn++) {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(1500);

  const frames = await page.evaluate(() => (window as Window & { turnFrames?: TurnFrame[] }).turnFrames!);
  const drawing = frames.filter((frame) => frame.progress > 0 && frame.progress < 1);
  expect(new Set(drawing.map((frame) => frame.page)).size, 'no turned page caught drawing its dog-ear').toBeGreaterThan(1);
  // While the page's clip-path pulse exists, Chrome paints the page's cut where it stood when
  // that pulse started, at no fold, so the flap grows over a corner that stays whole.
  expect(drawing.filter((frame) => frame.pulses > 0)).toEqual([]);
  await expect.poll(async () => (await foldState(stack)).pulses, { timeout: 2_000 }).toEqual(['running', 'running', 'running']);
});
