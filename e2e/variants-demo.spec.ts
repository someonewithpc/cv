import { expect, test, type Locator, type Page } from '@playwright/test';

import {
  frontPage,
  frontPageIndex,
  frontPageName,
  swipeToPage,
  waitForIslandMounted,
} from './support/paperStack';

/** Fourth stack on the page: logo, marker editor, space builder, then this one. */
function variantsStack(page: Page) {
  return page.locator('article.technical-drawing-stack').nth(3);
}

/** The panel on the front page, whether or not a script has run on it. */
async function openPanel(page: Page): Promise<Locator> {
  const stack = variantsStack(page);
  await stack.scrollIntoViewIfNeeded();
  const front = frontPage(stack, await frontPageIndex(stack));
  return front.locator('.variants-stage');
}

/** The panel with its script mounted and the autoplay handed over to the test. */
async function openDemo(page: Page): Promise<Locator> {
  const stack = variantsStack(page);
  await stack.scrollIntoViewIfNeeded();
  const front = frontPage(stack, await frontPageIndex(stack));
  await waitForIslandMounted(front);
  const app = front.locator('.variants-stage');
  await expect(app).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  // Focus hands the demo over from its autoplay loop, which would otherwise keep working
  // the same controls this test drives.
  await app.focus();
  await expect(app).toHaveAttribute('data-user-control', 'true');
  return app;
}

function card(app: Locator, id: string) {
  return app.locator(`[data-catalog-item="${id}"]`);
}

/** Clicks where the carousel's next arrow sits, a CSS scroll button with no DOM node. */
async function clickNextArrow(page: Page, styles: Locator) {
  const box = await styles.boundingBox();
  if (!box) throw new Error('The carousel has no layout box');
  await page.mouse.click(box.x + box.width - 14, box.y + box.height / 2);
}

/** The scroll marker's fill: transparent until the slide is the current one. */
function markerBackground(slide: Locator) {
  return slide.evaluate((el) => getComputedStyle(el, '::scroll-marker').backgroundColor);
}

/** The sliding dot's box against the carousel's: on the pip row, centred under the pips. */
async function dotOnPipRow(styles: Locator, dot: Locator, index: number) {
  const tile = await styles.boundingBox();
  const box = await dot.boundingBox();
  if (!tile || !box) throw new Error('The carousel or its dot has no layout box');
  const pip = 18;
  const pips = await styles.locator('.style').count();
  const rowLeft = tile.x + tile.width / 2 - (pips * pip) / 2;
  expect(box.height).toBeGreaterThan(6);
  expect(box.height).toBeLessThan(12);
  expect(Math.abs(box.width - box.height)).toBeLessThan(1);
  // Bottom 0.25rem plus the pip's own margin: the dot sits inside the pip strip.
  expect(tile.y + tile.height - (box.y + box.height)).toBeGreaterThan(4);
  expect(tile.y + tile.height - (box.y + box.height)).toBeLessThan(pip);
  expect(box.x + box.width / 2).toBeCloseTo(rowLeft + (index + 0.5) * pip, 0);
}

test.describe('metric locale', () => {
  test.use({ locale: 'pt-PT' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('the panel holds both cards and no scene', async ({ page }) => {
    const app = await openDemo(page);

    await expect(card(app, 'chair')).toBeVisible();
    await expect(card(app, 'table-round')).toBeVisible();
    await expect(variantsStack(page).locator('canvas')).toHaveCount(0);
    // The chair's finishes share seat count and size, so they are one cell: a carousel, not
    // a pair of dropdowns.
    await expect(card(app, 'chair').locator('.hover-select')).toHaveCount(0);
    await expect(card(app, 'chair').locator('ul.styles .style')).toHaveCount(5);
    await expect(card(app, 'table-round').locator('.hover-select')).toHaveCount(2);
  });

  test('the carousel steps a finish and the active pip follows', async ({ page }) => {
    const app = await openDemo(page);
    const chair = card(app, 'chair');
    const styles = chair.locator('ul.styles');
    const slides = styles.locator('.style');
    const dot = chair.locator('.active-pip');

    await expect(slides.nth(0).locator('.group-object-count')).toContainText('1');
    expect(await markerBackground(slides.nth(0))).not.toBe('rgba(0, 0, 0, 0)');
    await dotOnPipRow(styles, dot, 0);

    await clickNextArrow(page, styles);
    await expect(styles).toHaveAttribute('data-index', '1');
    await expect(chair).toHaveAttribute('data-variant', 'chair-gold');
    await expect.poll(() => markerBackground(slides.nth(1))).not.toBe('rgba(0, 0, 0, 0)');
    expect(await markerBackground(slides.nth(0))).toBe('rgba(0, 0, 0, 0)');
    await dotOnPipRow(styles, dot, 1);
  });

  test('sizes read with the product\'s rounding', async ({ page }) => {
    const app = await openDemo(page);

    await expect(card(app, 'chair').locator('.object-size .option-text')).toHaveText('42cm x 50cm x 95cm');
    await expect(card(app, 'table-round').locator('.object-size .hover-select-current .option-text'))
      .toHaveText('2.4m x 1.2m');
  });

  test('a size with no object at the current seat count falls back', async ({ page }) => {
    const app = await openDemo(page);

    const set = card(app, 'table-round');
    const seats = set.locator('.object-pax');
    const size = set.locator('.object-size');
    await expect(seats.locator('.hover-select-current')).toContainText('8 seats');

    await size.locator('.hover-select-current').click();
    const smaller = size.locator('.hover-select-options li').nth(1);
    await expect(smaller).toHaveClass(/unavailable/);
    await smaller.locator('button').click();

    // Eight seats has no smaller table, so the seat count moves with the size.
    await expect(size.locator('.hover-select-current')).toContainText('1.8m x 76cm');
    await expect(seats.locator('.hover-select-current')).toContainText('6 seats');
    await expect(set).toHaveAttribute('data-variant', 'table-6-182');
  });

  test('the sheets draw the real card and are three pages in all', async ({ page }) => {
    const stack = variantsStack(page);
    await stack.scrollIntoViewIfNeeded();
    await expect.poll(() => frontPageName(stack)).toBe('Space Builder · Object Variants');
    await expect(stack.locator(':scope > div')).toHaveCount(3);

    await swipeToPage(page, stack, 'Variant Groups');
    const groups = frontPage(stack, await frontPageIndex(stack));
    await expect(groups.locator('.drawn .option-item')).toHaveCount(2);
    await expect(groups.locator('.drawn ul.styles .style')).toHaveCount(5);
    // One callout set per sheet orientation; the visible one names every part that picks.
    const callouts = groups.locator('svg text:visible');
    await expect(callouts).toHaveCount(5);
    await expect(callouts.filter({ hasText: /pip/i })).toHaveCount(1);
    await expect(callouts.filter({ hasText: /Seats/ })).toHaveCount(1);

    await swipeToPage(page, stack, 'Missing Variants');
    const missing = frontPage(stack, await frontPageIndex(stack));
    await expect(missing.locator('.drawn details.object-pax')).toHaveAttribute('open', '');
    await expect(missing.locator('.drawn .object-pax li.unavailable')).toHaveCount(2);
  });
});

test.describe('US locale', () => {
  test.use({ locale: 'en-US' });

  test('sizes read in feet and inches', async ({ page }) => {
    await page.goto('/');
    const app = await openDemo(page);

    await expect(card(app, 'chair').locator('.object-size .option-text')).toHaveText('17" x 20" x 37"');
    const size = card(app, 'table-round').locator('.object-size');
    await expect(size.locator('.hover-select-current .option-text')).toHaveText('8\' x 48"');
    await expect(size.locator('.hover-select-options li').nth(1)).toContainText('6\' x 30"');
  });
});

test.describe('scripting off', () => {
  test.use({ javaScriptEnabled: false, locale: 'en-US' });

  test('the carousel still moves and the sizes are metric', async ({ page }) => {
    await page.goto('/');
    const app = await openPanel(page);
    const chair = card(app, 'chair');
    const styles = chair.locator('ul.styles');
    const slides = styles.locator('.style');

    await expect(card(app, 'table-round').locator('.object-size .hover-select-current .option-text'))
      .toHaveText('2.4m x 1.2m');
    await expect(chair.locator('.object-size .option-text')).toHaveText('42cm x 50cm x 95cm');

    await clickNextArrow(page, styles);
    await expect.poll(() => styles.evaluate((el) => Math.round(el.scrollLeft / el.clientWidth))).toBe(1);
    await expect.poll(() => markerBackground(slides.nth(1))).not.toBe('rgba(0, 0, 0, 0)');
    await expect.poll(() => markerBackground(slides.nth(0))).toBe('rgba(0, 0, 0, 0)');
    await dotOnPipRow(styles, chair.locator('.active-pip'), 1);
  });
});

test.describe('without CSS scroll markers', () => {
  test.use({ locale: 'pt-PT' });

  test.beforeEach(async ({ page }) => {
    // Pretend the browser lacks scroll markers and scroll timelines, so the script builds
    // the arrows and pips itself.
    await page.addInitScript(() => {
      const supports = CSS.supports.bind(CSS);
      CSS.supports = ((...args: [string, string?]) => {
        const query = args.join(':');
        if (query.includes('scroll-marker') || query.includes('animation-timeline')) return false;
        return supports(...args);
      }) as typeof CSS.supports;
    });
    await page.goto('/');
  });

  test('the script builds the arrows and pips', async ({ page }) => {
    const app = await openDemo(page);
    const chair = card(app, 'chair');
    const styles = chair.locator('ul.styles');
    const pips = chair.locator('.pagination-control li button');

    await expect(pips).toHaveCount(5);
    await expect(pips.nth(0)).toHaveAttribute('aria-current', 'true');
    await expect(chair.locator('button.previous')).toBeDisabled();

    await chair.locator('button.next').click();
    await expect(styles).toHaveAttribute('data-index', '1');
    await expect(pips.nth(1)).toHaveAttribute('aria-current', 'true');
    await expect(pips.nth(0)).not.toHaveAttribute('aria-current', 'true');
    await expect(chair.locator('button.previous')).toBeEnabled();

    await pips.nth(4).click();
    await expect(styles).toHaveAttribute('data-index', '4');
    await expect(chair.locator('button.next')).toBeDisabled();
    await expect(chair).toHaveAttribute('data-variant', 'chair-black');
  });
});
