import { expect, test } from '@playwright/test';

import { demoStack, frontPage, frontPageIndex, pressTurn, turnToPage } from './support/paperStack';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

function visrezStack(page: import('@playwright/test').Page) {
  return demoStack(page, 'Visrez Animated Loading Logo');
}

test('main page: the loading-logo SVG renders and its dash animation runs', async ({ page }) => {
  const stack = visrezStack(page);
  await stack.scrollIntoViewIfNeeded();
  const front = frontPage(stack, await frontPageIndex(stack));

  const svg = front.locator('svg').first();
  await expect(svg).toBeVisible();

  const animatedPath = front.locator('svg [style*="dash-animation"]').first();
  const animationName = await animatedPath.evaluate((el) => getComputedStyle(el).animationName);
  expect(animationName).not.toBe('none');
});

// Every page of a stack shares one grid cell once its script runs, so a covered page's
// drawing is laid out and visible without turning to it. Turning is checked in
// paper-stack-fold.spec.ts, which swipes this stack through every page by name.
test('every inner page carries its drawing', async ({ page }) => {
  const stack = visrezStack(page);
  const pageNamed = (name: string) => stack.locator(':scope > div').filter({
    has: page.locator('h2.typewriter', { hasText: name }),
  });

  await expect(pageNamed('Original Logo').locator('svg').first()).toBeVisible();
  await expect(pageNamed('Cube :)').locator('svg').first()).toBeVisible();
  await expect(pageNamed('Authored Path').locator('svg.path-layer')).toBeVisible();
  const listing = pageNamed('Path Data').locator('pre.path-data-layer');
  await expect(listing).toBeVisible();
  await expect(listing).toContainText('<svg');
  await expect(pageNamed('Putting it all together').locator('svg.face')).toBeVisible();
});

test('cube page: its diagram animation starts when the page is turned to', async ({ page }) => {
  const stack = visrezStack(page);
  await stack.scrollIntoViewIfNeeded();
  await turnToPage(stack, 'Cube :)');
  const front = frontPage(stack, await frontPageIndex(stack));

  // Every page of a stack sits in the same grid cell, so this finite intro animation used
  // to run, and finish, while the page was still covered — a visitor turning here got the
  // end state and never saw it move.
  const running = () => front.locator('section').first().evaluate((section) => section
    .getAnimations({ subtree: true })
    .filter((animation) => animation.playState === 'running').length);
  await expect.poll(running, { timeout: 15_000 }).toBeGreaterThan(0);
});

test('cube page: twelve edges, drawn in ink that stands off the grid on every theme', async ({ page }) => {
  const stack = visrezStack(page);
  await stack.scrollIntoViewIfNeeded();
  await turnToPage(stack, 'Cube :)');
  const front = frontPage(stack, await frontPageIndex(stack));

  // One element per edge. The bordered faces this replaced drew every edge twice.
  await expect(front.locator('.scene .edge')).toHaveCount(12);

  // Resolve the strip's ink and the sheet's grid colour on the same sheet, so the reading
  // follows the theme rather than the token names. The tokens are oklch mixes, and Chrome
  // keeps them in oklch when computed; a canvas turns both into sRGB bytes.
  const colours = () => front.locator('section.blueprint').evaluate((sheet) => {
    const rgb = (value: string) => {
      const probe = document.createElement('span');
      probe.style.color = value;
      sheet.append(probe);
      const context = document.createElement('canvas').getContext('2d')!;
      context.fillStyle = getComputedStyle(probe).color;
      context.fillRect(0, 0, 1, 1);
      probe.remove();
      return [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)];
    };
    const edge = sheet.querySelector('.scene .edge')!;
    return { ink: rgb(getComputedStyle(edge, '::before').backgroundColor), grid: rgb('var(--blueprint-grid)') };
  });
  const distance = (a: number[], b: number[]) => Math.hypot(...a.map((channel, i) => channel - b[i]));

  for (const theme of ['light', 'dark', 'arctic', 'dark-forest']) {
    await page.locator(`#theme-picker label:has(input[value="${theme}"])`).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.waitForTimeout(900);

    const { ink, grid } = await colours();
    // The accent this replaced sat 30 from the grid on the arctic sheet; the ink sits 160 or more.
    expect(distance(ink, grid), `${theme}: ink ${ink} against grid ${grid}`).toBeGreaterThan(120);
  }
});

test('cube page: every strip is cut to a point at each end, so the vertices join cleanly', async ({ page }) => {
  const stack = visrezStack(page);
  await stack.scrollIntoViewIfNeeded();
  await turnToPage(stack, 'Cube :)');
  const front = frontPage(stack, await frontPageIndex(stack));

  // A square strip end pokes past the strips it meets at a vertex. The cut is four corner
  // gradients and a middle fill on both strips; a single flat fill here means it was dropped.
  const cuts = await front.locator('.scene .edge').evaluateAll((edges) => edges.flatMap((edge) => [
    getComputedStyle(edge, '::before').backgroundImage,
    getComputedStyle(edge, '::after').backgroundImage,
  ]));
  expect(cuts).toHaveLength(24);
  for (const cut of cuts) expect(cut.match(/linear-gradient\(/g)).toHaveLength(5);
});

// The last page and the first are both plain paper, but the pages between are blueprints. A
// turn that wraps round empties the pile at once, and if the first page's folded-back corner
// eased shut afterwards, the blueprints gliding back under the stack showed through it as a
// blue wedge. So the corner is hit-tested inside the fold-back triangle on every frame from the
// commit on: the first page's own content has to be there.
test('wrapping round to the first page brings its corner back whole at once', async ({ page }) => {
  const stack = visrezStack(page);
  await stack.scrollIntoViewIfNeeded();
  await turnToPage(stack, 'Putting it all together');

  await stack.evaluate((el) => {
    const w = window as Window & { cornerHits?: boolean[] };
    const hits: boolean[] = (w.cornerHits = []);
    const first = el.children[0] as HTMLElement;
    const content = first.querySelector<HTMLElement>(
      ':scope > :not(.paper-fold, .paper-back-grab, .paper-clip, .paper-clip-under, .paper-flip-hint)',
    )!;
    const sample = () => {
      const box = first.getBoundingClientRect();
      const at = document.elementsFromPoint(box.left + 8, box.top + 12);
      hits.push(at.some((hit) => content.contains(hit)));
    };
    const observer = new MutationObserver(() => {
      if (first.style.getPropertyValue('--page-index').trim() !== '1') return;
      observer.disconnect();
      const start = performance.now();
      const frame = () => {
        sample();
        if (performance.now() - start < 400) requestAnimationFrame(frame);
      };
      frame();
    });
    observer.observe(first, { attributes: true, attributeFilter: ['style'] });
  });
  await pressTurn(stack, 'ArrowRight');
  expect(await frontPageIndex(stack)).toBe(0);

  const hits = await page.evaluate(() => (window as Window & { cornerHits?: boolean[] }).cornerHits!);
  expect(hits.length).toBeGreaterThan(3);
  expect(hits.every(Boolean), `corner hits per frame: ${hits.join(' ')}`).toBe(true);
});

// Turned fast all the way round, the stack is back on its first page, with no page behind it to
// drag back. The way-back callout must not be there, and on the way it must never come up
// while a page is still moving: each settle cut short by the next key press used to flash the
// whole line written out as it faded.
test.describe('with motion allowed', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('a fast run of turns round to the first page leaves no way back showing', async ({ page }) => {
    const stack = visrezStack(page);
    await stack.scrollIntoViewIfNeeded();
    const frame = page.locator('.technical-drawing-frame', { has: stack });
    await expect(frame).toHaveAttribute('data-hint-show', '');

    await stack.evaluate((el) => {
      const w = window as Window & { backInk?: { ink: number; bad: boolean }[] };
      const samples: { ink: number; bad: boolean }[] = (w.backInk = []);
      const words = el.closest('.technical-drawing-frame')!.querySelector<HTMLElement>('.flip-hint--back.hint-words')!;
      const letters = [...words.querySelectorAll<HTMLElement>('.hint-letter')];
      const frameStep = () => {
        const ink = Number(getComputedStyle(words).opacity)
          * Math.max(...letters.map((letter) => Number(getComputedStyle(letter).opacity)));
        const prev = samples.at(-1)?.ink ?? 0;
        const due = el.hasAttribute('data-paper-flipped') && el.hasAttribute('data-paper-settled');
        samples.push({ ink, bad: !due && ink > prev + 0.001 });
        requestAnimationFrame(frameStep);
      };
      requestAnimationFrame(frameStep);
    });

    await stack.focus();
    let moved = false;
    for (let press = 0; press < 40; press += 1) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(250);
      const front = await frontPageIndex(stack);
      if (front > 0) moved = true;
      if (moved && front === 0) break;
    }
    expect(moved).toBe(true);
    expect(await frontPageIndex(stack)).toBe(0);
    await expect(stack).toHaveAttribute('data-paper-settled', '', { timeout: 3000 });
    await expect(stack).not.toHaveAttribute('data-paper-flipped');
    // Past the callout's own fade, so a way back that was coming would be in by now
    await page.waitForTimeout(600);

    const samples = await page.evaluate(() => (window as Window & { backInk?: { ink: number; bad: boolean }[] }).backInk!);
    expect(samples.at(-1)!.ink, 'no way back on the first page').toBe(0);
    const flashes = samples.filter((sample) => sample.bad).length;
    expect(flashes, 'frames where the way back came up while it had nowhere to point').toBe(0);
  });
});
