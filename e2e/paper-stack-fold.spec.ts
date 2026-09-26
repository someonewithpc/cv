import { expect, type Locator, type Page, test } from '@playwright/test';

import { demoStack, frontPageIndex, frontPageName, pressTurn, swipeStack } from './support/paperStack';

const DEMOS = [
  {
    label: 'Visrez logo animation',
    pages: [
      'Visrez Animated Loading Logo',
      'Original Logo',
      'Cube :)',
      'Authored Path',
      'Path Data',
      'Putting it all together',
    ],
  },
  {
    label: 'Marker editor',
    pages: [
      'Interactive Map Marker Editor',
      'Marker Selector',
      'Marker Editor',
      'Preview Background',
      'Composable Parts',
      'Undoable Store',
    ],
  },
  {
    label: 'Space builder',
    pages: [
      'Space Builder · Add Tool',
      'Place Area',
      'Edit Parameters',
      'Layout Styles',
      'Capacity Badge',
    ],
  },
  {
    label: 'Drag and drop',
    pages: [
      'Space Builder · Drag & Drop',
      'Picture to Model',
    ],
  },
];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

for (const demo of DEMOS) {
  test(`${demo.label}: forward swipes visit every page in order, then wrap`, async ({ page }) => {
    const stack = demoStack(page, demo.pages[0]);
    await stack.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    expect(await stack.locator(':scope > div').count()).toBe(demo.pages.length);
    expect(await frontPageIndex(stack)).toBe(0);
    expect(await frontPageName(stack)).toBe(demo.pages[0]);

    for (let i = 1; i < demo.pages.length; i += 1) {
      await swipeStack(page, stack, true);
      expect(await frontPageName(stack), `page ${i} after ${i} forward swipe(s)`).toBe(demo.pages[i]);
    }

    // One more forward swipe past the last page wraps back to the first.
    await swipeStack(page, stack, true);
    expect(await frontPageName(stack)).toBe(demo.pages[0]);
  });
}

test('marker editor: backward swipe is clamped at the first page', async ({ page }) => {
  const stack = demoStack(page, 'Interactive Map Marker Editor');
  await stack.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  expect(await frontPageName(stack)).toBe('Interactive Map Marker Editor');

  // Nothing behind the front page — a backward swipe here is a no-op, not a wrap.
  await swipeStack(page, stack, false);
  expect(await frontPageName(stack)).toBe('Interactive Map Marker Editor');
  await swipeStack(page, stack, false);
  expect(await frontPageName(stack)).toBe('Interactive Map Marker Editor');
});

test('visrez logo: the dog-ear repaints when the theme changes', async ({ page }) => {
  const stack = demoStack(page, 'Visrez Animated Loading Logo');
  await stack.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  // The flap paints the back of the sheet in the page's own colour, lifted off it by JS, so a
  // theme switch has to be picked up there as well as in the stylesheet.
  for (const theme of ['dark', 'arctic', 'dark-forest', 'light']) {
    await page.locator(`#theme-picker input[value="${theme}"]`).click({ force: true });
    // The picker writes data-theme back once its view transition has finished
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

    const paint = await stack.evaluate((el) => {
      const fold = el.querySelector<HTMLElement>('.paper-fold')!;
      const sheet = fold.parentElement!;
      const section = sheet.querySelector<HTMLElement>(
        ':scope > :not(.paper-fold, .paper-back-grab, .paper-clip, .paper-clip-under, .paper-flip-hint)',
      )!;
      return { fold: getComputedStyle(fold).backgroundColor, page: getComputedStyle(section).backgroundColor };
    });
    expect(paint.fold, `dog-ear under the ${theme} theme`).toBe(paint.page);
  }
});

test('visrez logo: the dog-ear is lit at its tip and shaded along the crease', async ({ page }) => {
  const stack = demoStack(page, 'Visrez Animated Loading Logo');
  await stack.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  // The flap's darkening gradient runs along the crease's normal from the page's bottom-right
  // corner, where the crease lies fold-x·sin(a) in. Its darkest stop has to sit on the crease
  // with a lighter stop either side of it: the corner is where the sheet lies flat and catches
  // the light, whichever of the flap's two renderings puts the corner nearer 0 or 2·crease.
  for (const theme of ['light', 'dark', 'arctic', 'dark-forest']) {
    await page.locator(`#theme-picker input[value="${theme}"]`).click({ force: true });
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

    const shade = await stack.evaluate((el) => {
      const fold = el.querySelector<HTMLElement>('.paper-fold')!;
      const sheet = getComputedStyle(fold.parentElement!);
      const x = Number.parseFloat(sheet.getPropertyValue('--fold-x'));
      const y = Number.parseFloat(sheet.getPropertyValue('--fold-y'));
      const stops = [...getComputedStyle(fold).backgroundImage.matchAll(/rgba\(0, 0, 0, ([\d.]+)\) ([\d.]+)px/g)]
        .map((match) => ({ alpha: Number(match[1]), at: Number(match[2]) }))
        .sort((a, b) => a.at - b.at);
      return { crease: x * Math.sin(Math.atan2(y, x)), stops };
    });
    expect(shade.stops, `dark stops under the ${theme} theme`).toHaveLength(3);
    const [near, crease, far] = shade.stops;
    expect(Math.abs(crease.at - shade.crease)).toBeLessThan(1);
    expect(near.at).toBeLessThan(shade.crease);
    expect(far.at).toBeGreaterThan(shade.crease);
    expect(crease.alpha).toBeGreaterThan(near.alpha);
    expect(crease.alpha).toBeGreaterThan(far.alpha);
  }
});

test('visrez logo: a back-drag shades the crease from its first move', async ({ page }) => {
  const stack = demoStack(page, 'Visrez Animated Loading Logo');
  await stack.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await pressTurn(stack, 'ArrowRight');

  // A short pull on the folded-back corner: the previous page starts to fold up behind the
  // stack, well short of coming over the clip, and its crease has to be shaded already.
  const grab = await stack.locator('.paper-front > .paper-back-grab').boundingBox();
  const grip = { x: grab!.x + grab!.width * 0.4, y: grab!.y + grab!.height * 0.4 };
  await page.mouse.move(grip.x, grip.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i += 1) {
    await page.mouse.move(grip.x + 5 * i, grip.y + 5 * i);
    await page.waitForTimeout(20);
  }

  const shade = await stack.evaluate((el) => {
    const fold = el.querySelector<HTMLElement>('.paper-fold--active')!;
    const sheet = getComputedStyle(fold.parentElement!);
    const x = Number.parseFloat(sheet.getPropertyValue('--fold-x'));
    const y = Number.parseFloat(sheet.getPropertyValue('--fold-y'));
    const peaks = [...getComputedStyle(fold).backgroundImage.matchAll(/rgba\(0, 0, 0, ([\d.]+)\) ([\d.-]+)px/g)]
      .map((match) => ({ alpha: Number(match[1]), at: Number(match[2]) }))
      .filter((stop) => stop.alpha > 0.2)
      .sort((a, b) => a.at - b.at);
    return { approaching: !fold.parentElement!.classList.contains('paper-front'), rest: x * Math.sin(Math.atan2(y, x)), peaks };
  });
  await page.mouse.up();

  expect(shade.approaching, 'the page is still on its way over').toBe(true);
  // Two creases carry a dark stop: the moving one, nearer the corner in the flap's own box,
  // and the resting one the fold started from.
  expect(shade.peaks).toHaveLength(2);
  const [moving, resting] = shade.peaks;
  expect(Math.abs(resting.at - shade.rest)).toBeLessThan(1);
  expect(moving.at).toBeLessThan(shade.rest - 20);
  expect(moving.alpha).toBeGreaterThan(0.2);
});

test('visrez logo: the dog-ear is drawn while the flip is still landing', async ({ page }) => {
  const stack = demoStack(page, 'Visrez Animated Loading Logo');
  await stack.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  // Watch from inside the page. A flip renumbers --page-index halfway through and only hands the
  // flap over at the very end, so what matters is the paper: from the renumber on, the page at
  // the front must have a flap of its own, and it must be drawn well before the flip lands.
  // The flap's width is --fold-x, so its painted size measures the reveal too.
  const watch = stack.evaluate((el) => new Promise<{
    bareFrames: number, drawnAfter: number, landing: boolean, flapCount: number,
  }>((resolve, reject) => {
    const pages = [...el.children] as HTMLElement[];
    const frontPage = () => pages.find((p) => p.style.getPropertyValue('--page-index').trim() === '1')!;
    const started = frontPage();
    const deadline = performance.now() + 10_000;
    let restacked = 0;
    let bareFrames = 0;
    const tick = () => {
      const front = frontPage();
      if (!restacked && front !== started) restacked = performance.now();
      if (restacked) {
        const flap = front.querySelector<HTMLElement>('.paper-fold');
        if (!flap) bareFrames += 1;
        // 2cm is the resting dog-ear, so a fifth of that is unmistakably paper, not a hairline
        if (flap && flap.getBoundingClientRect().width > 20) {
          resolve({
            bareFrames,
            drawnAfter: performance.now() - restacked,
            landing: !!el.querySelector('.paper-fold--active'),
            flapCount: el.querySelectorAll('.paper-fold').length,
          });
          return;
        }
      }
      if (performance.now() > deadline) {
        reject(new Error(restacked ? 'the dog-ear never came back' : 'the stack never turned a page'));
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));

  await stack.focus();
  await page.keyboard.press('ArrowRight');
  const seen = await watch;

  expect(seen.bareFrames, 'frames where the front page had no flap at all').toBe(0);
  expect(seen.drawnAfter, 'ms from the renumber to a drawn dog-ear').toBeLessThan(400);
  expect(seen.landing, 'the flipped sheet is still folding away').toBe(true);
  // One flap is the real one finishing the flip, the other the stand-in holding the new front
  // page's dog-ear until it is free.
  expect(seen.flapCount).toBe(2);

  // And the stand-in gives way rather than piling up.
  await expect(stack.locator('.paper-fold')).toHaveCount(1, { timeout: 2500 });
  await expect(stack.locator('.paper-fold--stand-in')).toHaveCount(0);
});

// A point on the folded-back corner itself, to grab with a real pointer drag (see
// flip-hint-arrow.spec.ts's identical helper). The flap's box runs past the sheet edge, so its
// centre can fall in the cut-away corner and land on the page under it instead; the resting
// crease runs from (w - x, h) to (w, h - y) and the corner is mirrored across it, so the flap
// is that triangle and its centroid is inside it on any sheet.
const flapGrip = (stack: Locator) => stack.locator('.paper-front').evaluate((sheet) => {
  const fold = sheet.querySelector<HTMLElement>('.paper-fold')!;
  const style = getComputedStyle(fold);
  const x = parseFloat(style.getPropertyValue('--fold-x'));
  const y = parseFloat(style.getPropertyValue('--fold-y'));
  const { right, bottom } = sheet.getBoundingClientRect();
  const mirrored = { x: right - (2 * x * y * y) / (x * x + y * y), y: bottom - (2 * x * x * y) / (x * x + y * y) };
  return {
    x: (right - x + right + mirrored.x) / 3,
    y: (bottom + bottom - y + mirrored.y) / 3,
  };
});

// The dog-ear's own size, read the way fold-drag.ts writes it while dragging or resting.
const foldSize = (stack: Locator) => stack.locator('.paper-front').evaluate((sheet) => {
  const style = getComputedStyle(sheet);
  return {
    x: parseFloat(style.getPropertyValue('--fold-x')),
    y: parseFloat(style.getPropertyValue('--fold-y')),
  };
});

// Drags the front page's dog-ear through a sequence of corner-relative offsets from the grab
// point (in CSS px, +x right / +y down), a handful of pointermove events per leg so fold-drag.ts
// sees the travel rather than a single jump. Leaves the button down; callers release it.
const dragFold = async (page: Page, stack: Locator, legs: { dx: number, dy: number }[]): Promise<{ x: number, y: number }> => {
  const grip = await flapGrip(stack);
  await page.mouse.move(grip.x, grip.y);
  await page.mouse.down();
  for (const { dx, dy } of legs) {
    const steps = 8;
    for (let i = 1; i <= steps; i += 1) {
      await page.mouse.move(grip.x + (dx * i) / steps, grip.y + (dy * i) / steps);
      await page.waitForTimeout(20);
    }
  }
  return grip;
};

test.describe('a drag that pulls the wrong way cancels', () => {
  // The pulse that periodically grows the resting dog-ear (fold-reveal-pulse in index.astro)
  // would otherwise move --fold-x/-y out from under a before/after comparison independently of
  // anything a drag does.
  test.use({ reducedMotion: 'reduce' });

  test('80px straight down-right from the grab cancels: no flip, no fold left behind', async ({ page }) => {
    const stack = page.locator('article.technical-drawing-stack').first();
    await stack.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    const before = await frontPageIndex(stack);
    const restBefore = await foldSize(stack);

    // Grabbing the corner and pulling it further away from the page — down and right, the
    // opposite of the fold — is the drag Hugo described as "weird": before the fix this runs the
    // tip toward the near-zero singularity in foldSizeFromTip (see fold-drag.ts), and --fold-x/-y
    // rocket up rather than shrinking smoothly (this stack reads x 90.58, y 31.57 six pixels out
    // along the outward axis, more than a fifth again its 75.59/37.80 resting size, and by twelve
    // pixels out x is past 300 before flipping negative). 80px clears the 10px
    // FOLD_CANCEL_OUTWARD_MARGIN many times over, so the fix gives the drag up long before any of
    // that is reached.
    await dragFold(page, stack, [{ dx: 80, dy: 80 }]);
    await page.mouse.up();
    await page.waitForTimeout(1500);

    expect(await frontPageIndex(stack), 'front page unchanged, no flip').toBe(before);
    const restAfter = await foldSize(stack);
    expect(restAfter.x, '--fold-x back at rest').toBeCloseTo(restBefore.x, 0);
    expect(restAfter.y, '--fold-y back at rest').toBeCloseTo(restBefore.y, 0);
  });

  test('a small wobble the wrong way on grab, then a strong pull inward, still turns the page', async ({ page }) => {
    const stack = page.locator('article.technical-drawing-stack').first();
    await stack.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    const before = await frontPageIndex(stack);

    // A hand settling onto the corner before it pulls — a few pixels the wrong way, well inside
    // the 10px FOLD_CANCEL_OUTWARD_MARGIN — must not cancel the drag that follows: only outward
    // travel past the margin does, and a pointer that comes back inside it keeps its drag. The
    // recovery pull is well past this stack's own commit point (a plain 200px pull, the figure a
    // hand's throw might cover, isn't quite enough to carry this particular sheet's corner past
    // its commit point at all, even with no wobble first, so 400px is used here for a pull
    // comfortably past it).
    await dragFold(page, stack, [{ dx: 5, dy: 5 }, { dx: -395, dy: -395 }]);
    await page.mouse.up();

    await expect.poll(() => frontPageIndex(stack), { message: 'the turn still committed', timeout: 2500 }).not.toBe(before);
  });

  test('a normal forward drag still turns the page', async ({ page }) => {
    const stack = page.locator('article.technical-drawing-stack').first();
    await stack.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    const before = await frontPageIndex(stack);
    const sheet = (await stack.locator('.paper-front').boundingBox())!;
    await dragFold(page, stack, [{ dx: -sheet.width * 0.6, dy: -sheet.height * 0.6 }]);
    await page.mouse.up();

    await expect.poll(() => frontPageIndex(stack), { message: 'the turn committed', timeout: 2500 }).not.toBe(before);
  });
});
