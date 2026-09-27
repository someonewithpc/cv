import { expect, test } from '@playwright/test';

/** --content-max / --breakout-max in Layout.astro: 60rem against a 16px root. */
const CAP = 960;

test('a wide viewport caps the content column and the demo stacks at 60rem', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');

  const main = page.locator('main');
  await expect(main).toHaveCSS('--content-max', '60rem');
  await expect(main).toHaveCSS('--breakout-max', '60rem');

  const columns = await main.evaluate((el) => {
    // The computed value carries the line names too; the track sizes are the px ones.
    const grid = getComputedStyle(el).gridTemplateColumns
      .split(/\s+/)
      .filter((token) => token.endsWith('px'))
      .map(parseFloat);
    // full-width | breakout | content | breakout | full-width
    return { content: grid[2], breakout: grid[1] + grid[2] + grid[3] };
  });
  expect(columns.content).toBeLessThanOrEqual(CAP);
  expect(columns.breakout).toBeLessThanOrEqual(CAP);

  const stacks = page.locator('article.technical-drawing-stack');
  expect(await stacks.count()).toBeGreaterThan(0);
  for (const width of await stacks.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width))) {
    expect(width).toBeLessThanOrEqual(CAP);
  }
});

test('a phone viewport fits the demo stacks without scrolling sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForTimeout(1000);

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    widest: Math.max(...[...document.querySelectorAll('article.technical-drawing-stack')].map((el) => el.getBoundingClientRect().right)),
  }));
  expect(overflow.scrollWidth).toBe(overflow.clientWidth);
  expect(overflow.widest).toBeLessThanOrEqual(overflow.clientWidth);
});
