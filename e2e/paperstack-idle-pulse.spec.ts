import { expect, test, type Locator, type Page } from '@playwright/test';

import { armDrawCounter, demoStack, frontPage, frontPageIndex, frontPageName, sceneDraws } from './support/paperStack';

/**
 * The resting dog-ear breathes on a loop (the fold pulse in PaperStack/index.astro). It used to
 * animate --fold-x/--fold-y, which the front page's crease clip-path reads, so every frame it
 * advanced cost a style resolve of that page and a repaint of the sheet. Seven stacks doing
 * that at once ate better than half a 60fps frame, for ever, which is time a page turn on one
 * of them no longer had. Now it is three animations the compositor runs, one per layer the
 * fold draws, and fold-drag.ts still pauses them while their stack is off screen.
 *
 * Read off the Web Animations API rather than off a class or an attribute, because that is
 * how it is driven: a class or an attribute would put the document's :has() rules back in
 * play on every scroll past, which is the cost this is avoiding in the first place.
 */
async function pulseStates(stack: Locator): Promise<string[]> {
  return stack.evaluate((el) =>
    [...el.querySelectorAll<HTMLElement>('.paper-front')]
      .flatMap((sheet) => sheet.getAnimations({ subtree: true }))
      .filter((animation) => (animation as CSSAnimation).animationName?.startsWith('fold-pulse-'))
      .map((animation) => animation.playState));
}

const RUNNING = ['running', 'running', 'running'];
const PAUSED = ['paused', 'paused', 'paused'];

test('the resting dog-ear breathes only on a stack that is on screen', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');

  const first = page.locator('article.technical-drawing-stack').first();
  await expect(first).toBeVisible();

  await first.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);
  expect(await pulseStates(first)).toEqual(RUNNING);

  // The foot of the page, nowhere near the first stack however many demos come after it.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(1000);
  expect(await pulseStates(first)).toEqual(PAUSED);

  // Back in view, and the tease picks up where it left off.
  await first.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);
  expect(await pulseStates(first)).toEqual(RUNNING);
});

test('a page turn leaves the new front page breathing', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');

  const stack = page.locator('article.technical-drawing-stack').first();
  await stack.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);
  const before = await frontPageName(stack);

  await stack.evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press('ArrowRight');
  await expect(stack).toHaveAttribute('data-paper-settled', '', { timeout: 20_000 });
  expect(await frontPageName(stack)).not.toBe(before);

  // The pulse travels with the front-page role, and the stack is in view, so it runs.
  expect(await pulseStates(stack)).toEqual(RUNNING);
  const front = frontPage(stack, await frontPageIndex(stack));
  await expect(front).toHaveClass(/paper-front/);
});

// What each pulse layer animates. A custom property, or anything else the compositor cannot run
// by itself, would put the page's style resolve and the sheet's repaint back on every frame.
test('the pulse animates only what the compositor runs on its own', async ({ page }) => {
  await page.goto('/');
  const stack = page.locator('article.technical-drawing-stack').first();
  await stack.scrollIntoViewIfNeeded();
  await expect.poll(() => pulseStates(stack)).toEqual(RUNNING);

  const animated = await stack.evaluate((el) =>
    el.querySelector('.paper-front')!.getAnimations({ subtree: true })
      .filter((animation) => (animation as CSSAnimation).animationName?.startsWith('fold-pulse-'))
      .map((animation) => {
        const keys = (animation.effect as KeyframeEffect).getKeyframes()
          .flatMap((frame) => Object.keys(frame))
          .filter((key) => !['offset', 'computedOffset', 'easing', 'composite'].includes(key));
        return `${(animation as CSSAnimation).animationName}: ${[...new Set(keys)].join(', ')}`;
      })
      .sort());
  expect(animated).toEqual([
    'fold-pulse-flap: transform',
    'fold-pulse-page: clipPath',
    'fold-pulse-shade: scale',
  ]);
});

// The pulse grows the dog-ear without moving --fold-x/-y, so a hand that takes the flap at the
// pulse's peak has to start from the size it sees there, not from the resting size.
test('taking the dog-ear mid-pulse starts the drag from the size it was drawn at', async ({ page }) => {
  await page.goto('/');
  const stack = page.locator('article.technical-drawing-stack').first();
  await stack.scrollIntoViewIfNeeded();
  await expect.poll(() => pulseStates(stack)).toEqual(RUNNING);

  // Held at its peak, 3cm by 2cm (index.astro's $fold-pulse-x/-y): the delay, then 90% of the
  // 7.5s run.
  const point = await stack.evaluate((el) => {
    for (const animation of el.querySelector('.paper-front')!.getAnimations({ subtree: true })) {
      if (!(animation as CSSAnimation).animationName?.startsWith('fold-pulse-')) continue;
      animation.pause();
      animation.currentTime = 1500 + 0.9 * 7500;
    }
    const flap = el.querySelector<HTMLElement>('.paper-front > .paper-fold')!;
    const rect = flap.getBoundingClientRect();
    for (const k of [0.45, 0.4, 0.35, 0.3, 0.25, 0.2]) {
      const at = { x: rect.left + rect.width * k, y: rect.top + rect.height * k };
      if (document.elementFromPoint(at.x, at.y) === flap) return at;
    }
    return null;
  });
  expect(point, 'a point on the flap at the peak').not.toBeNull();

  await page.mouse.move(point!.x, point!.y);
  await page.mouse.down();
  await page.mouse.move(point!.x - 2, point!.y - 2);
  const size = await stack.locator('.paper-front').evaluate((sheet) => ({
    x: parseFloat(sheet.style.getPropertyValue('--fold-x')),
    y: parseFloat(sheet.style.getPropertyValue('--fold-y')),
  }));
  await page.mouse.up();

  // 3cm and 2cm are 113.4px and 75.6px; the resting 2cm by 1cm would be 75.6px by 37.8px.
  expect(size.x).toBeGreaterThan(105);
  expect(size.y).toBeGreaterThan(68);
});

/**
 * Takes hold of the front page's dog-ear and returns the point the pointer is now on. The flap
 * is a triangle inside its box and it breathes, so a point picked off the box can be paper one
 * moment and page the next: the browser's own hit test has the last word, and it is asked again
 * after the pointer has landed (a pointer resting on the flap holds the pulse still).
 */
async function takeFlap(stack: Locator): Promise<{ x: number, y: number }> {
  const page = stack.page();
  await expect.poll(async () => (await stack.locator('.paper-fold').boundingBox())?.width ?? 0).toBeGreaterThan(20);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const point = await stack.evaluate((el) => {
      const flap = el.querySelector<HTMLElement>('.paper-fold')!;
      const rect = flap.getBoundingClientRect();
      for (const k of [0.45, 0.4, 0.35, 0.3, 0.25, 0.2]) {
        const at = { x: rect.left + rect.width * k, y: rect.top + rect.height * k };
        if (document.elementFromPoint(at.x, at.y) === flap) return at;
      }
      return null;
    });
    if (!point) continue;
    await page.mouse.move(point.x, point.y);
    await page.waitForTimeout(150);
    const held = await stack.evaluate(
      (el, at) => document.elementFromPoint(at.x, at.y) === el.querySelector('.paper-fold'),
      point,
    );
    if (held) return point;
  }
  throw new Error('no point on the dog-ear takes the pointer');
}

async function dragTo(page: Page, from: { x: number, y: number }, to: { x: number, y: number }): Promise<void> {
  for (let step = 1; step <= 12; step += 1) {
    await page.mouse.move(from.x + (to.x - from.x) * step / 12, from.y + (to.y - from.y) * step / 12);
    await page.waitForTimeout(30);
  }
}

/**
 * The demos hold still for a turn, but only from the commit point (watchPageActive in
 * client/frontPage.ts). The Space Builder stack is the one that shows it: its scenes render
 * every frame they are active for, and give the WebGL context back when they are not, so the
 * canvas's own draw count says whether the demo under the paper is still playing. A drag that
 * comes back short of the threshold has to leave it playing, since stopping there would cost
 * the scene its context for nothing.
 */
test('the demo under the paper plays until the turn is certain, then stops', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await armDrawCounter(page);

  const stack = demoStack(page, 'Space Builder · Add Tool');
  await stack.scrollIntoViewIfNeeded();
  const started = await frontPageIndex(stack);
  const front = frontPage(stack, started);
  const box = (await stack.boundingBox())!;

  const drawnOnArrival = await sceneDraws(front);
  await expect.poll(() => sceneDraws(front), { timeout: 30_000 }).toBeGreaterThan(drawnOnArrival);

  const grab = await takeFlap(stack);
  await page.mouse.down();

  // Short of the commit point: the flap says so, and the scene under it is still drawing.
  const shy = { x: box.x + box.width * 0.88, y: box.y + box.height * 0.88 };
  await dragTo(page, grab, shy);
  await expect(stack.locator('.paper-fold')).not.toHaveClass(/paper-fold--will-commit/);
  const drawnShort = await sceneDraws(front);
  await page.waitForTimeout(600);
  expect(await sceneDraws(front)).toBeGreaterThan(drawnShort);

  // Past it, with the hand still on the paper: the turn is going to happen, so the demo stops
  // now rather than at the release.
  await dragTo(page, shy, { x: box.x + box.width * 0.3, y: box.y + box.height * 0.3 });
  await expect(stack.locator('.paper-fold')).toHaveClass(/paper-fold--will-commit/);
  const drawnPastCommit = await sceneDraws(front);
  await page.waitForTimeout(600);
  expect(await sceneDraws(front)).toBe(drawnPastCommit);

  // And the page that arrives comes alive once the stack has settled, not before.
  await page.mouse.up();
  await expect(stack).toHaveAttribute('data-paper-settled', '', { timeout: 20_000 });
  const landed = await frontPageIndex(stack);
  expect(landed).not.toBe(started);
  const arrived = frontPage(stack, landed);
  const drawnOnLanding = await sceneDraws(arrived);
  await expect.poll(() => sceneDraws(arrived), { timeout: 30_000 }).toBeGreaterThan(drawnOnLanding);
});
