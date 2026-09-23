import { expect, test } from '@playwright/test';

import { frontPage, frontPageIndex, turnToPage } from './support/paperStack';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

function visrezStack(page: import('@playwright/test').Page) {
  return page.locator('article.technical-drawing-stack').nth(0);
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

test('original-logo page: the unoptimized original SVG is shown', async ({ page }) => {
  const stack = visrezStack(page);
  await stack.scrollIntoViewIfNeeded();
  await turnToPage(stack, 'Original Logo');
  const front = frontPage(stack, await frontPageIndex(stack));
  await expect(front.locator('svg').first()).toBeVisible();
});

test('cube page: the 3-face cube diagram is shown', async ({ page }) => {
  const stack = visrezStack(page);
  await stack.scrollIntoViewIfNeeded();
  await turnToPage(stack, 'Cube :)');
  const front = frontPage(stack, await frontPageIndex(stack));
  await expect(front.locator('svg').first()).toBeVisible();
});

test('authored-path page: the hand-authored path diagram is shown', async ({ page }) => {
  const stack = visrezStack(page);
  await stack.scrollIntoViewIfNeeded();
  await turnToPage(stack, 'Authored Path');
  const front = frontPage(stack, await frontPageIndex(stack));
  await expect(front.locator('svg.path-layer')).toBeVisible();
});

test('path-data page: the annotated SVG source listing is shown', async ({ page }) => {
  const stack = visrezStack(page);
  await stack.scrollIntoViewIfNeeded();
  await turnToPage(stack, 'Path Data');
  const front = frontPage(stack, await frontPageIndex(stack));
  await expect(front.locator('pre.path-data-layer')).toBeVisible();
  await expect(front.locator('pre.path-data-layer')).toContainText('<svg');
});

test('all-together page: the combined face diagram is shown', async ({ page }) => {
  const stack = visrezStack(page);
  await stack.scrollIntoViewIfNeeded();
  await turnToPage(stack, 'Putting it all together');
  const front = frontPage(stack, await frontPageIndex(stack));
  await expect(front.locator('svg.face')).toBeVisible();
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
