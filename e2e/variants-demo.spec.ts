import { devices, expect, test, type Locator, type Page } from '@playwright/test';

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

/** Take the pointer out of the card sideways, in a few moves. */
async function leaveCard(page: Page, card: Locator) {
  const box = await card.boundingBox();
  if (!box) throw new Error('The card has no layout box');
  await page.mouse.move(box.x + box.width + 60, box.y + box.height / 2, { steps: 6 });
}

/** Boxes of the open list and the picture: the list sits over the label rows, not the picture. */
async function expectListClearOfPicture(set: Locator, row: Locator) {
  const list = await row.locator('.hover-select-options').boundingBox();
  const picture = await set.locator('.object-icons').boundingBox();
  if (!list || !picture) throw new Error('The list or the picture has no layout box');
  expect(list.y).toBeGreaterThanOrEqual(picture.y + picture.height - 1);
}

/** A finger down, across the given points and up, through the CDP touch events. */
async function drag(page: Page, points: { x: number; y: number }[]) {
  const cdp = await page.context().newCDPSession(page);
  const [first, ...rest] = points;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] });
  for (const point of rest) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point] });
    await page.waitForTimeout(80);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

async function centre(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('The element has no layout box');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
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
    // Options grey against the selected object, so the set has to be the pick first.
    await set.locator('.object-icons').click();
    await expect(set).toHaveClass(/active/);

    await size.locator('.hover-select-current').click();
    const smaller = size.locator('.hover-select-options li').nth(1);
    await expect(smaller).toHaveClass(/unavailable/);
    await smaller.locator('button').click();

    // Eight seats has no smaller table, so the seat count moves with the size.
    await expect(size.locator('.hover-select-current')).toContainText('1.8m x 76cm');
    await expect(seats.locator('.hover-select-current')).toContainText('6 seats');
    await expect(set).toHaveAttribute('data-variant', 'table-6-182');
  });

  test('one card is selected at a time', async ({ page }) => {
    const app = await openDemo(page);
    const chair = card(app, 'chair');
    const set = card(app, 'table-round');

    await expect(chair).toHaveClass(/active/);
    await expect(set).not.toHaveClass(/active/);

    await set.locator('.object-icons').click();
    await expect(set).toHaveClass(/active/);
    await expect(chair).not.toHaveClass(/active/);

    // Hovering another option on the selected card lifts the highlight until the pointer
    // leaves; the pick stays where it was.
    await set.locator('.object-pax .hover-select-current').click();
    await set.locator('.object-pax .hover-select-options li').nth(1).hover();
    await expect(set).not.toHaveClass(/active/);
    await leaveCard(page, set);
    await expect(set).toHaveClass(/active/);
    await expect(set).toHaveAttribute('data-variant', 'table-8-243');

    await chair.locator('.style').first().locator('img').click();
    await expect(chair).toHaveClass(/active/);
    await expect(set).not.toHaveClass(/active/);
  });

  test('the seats and size rows share a square edge and read as one field', async ({ page }) => {
    const app = await openDemo(page);
    const set = card(app, 'table-round');
    const seats = set.locator('.object-pax .hover-select-current');
    const size = set.locator('.object-size .hover-select-current');
    const radii = (row: Locator) => row.evaluate((el) => {
      const style = getComputedStyle(el);
      return [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomLeftRadius, style.borderBottomRightRadius];
    });

    expect(await radii(seats)).toEqual(['4px', '4px', '0px', '0px']);
    expect(await radii(size)).toEqual(['0px', '0px', '4px', '4px']);
    const top = await seats.boundingBox();
    const bottom = await size.boundingBox();
    if (!top || !bottom) throw new Error('A row has no layout box');
    // The two borders sit on one another: one line between the rows, not two.
    expect(bottom.y).toBeCloseTo(top.y + top.height - 1, 0);

    // The field sits as far from the footer's sides as from its bottom edge.
    const footer = await set.locator('.item-label').boundingBox();
    if (!footer) throw new Error('The footer has no layout box');
    const sideInset = bottom.x - footer.x;
    const bottomInset = footer.y + footer.height - (bottom.y + bottom.height);
    expect(sideInset).toBeCloseTo(bottomInset, 0);

    await seats.click();
    expect(await radii(seats)).toEqual(['4px', '4px', '0px', '0px']);
    const list = set.locator('.object-pax .hover-select-options');
    await expect(list).toHaveCSS('border-bottom-left-radius', '4px');
  });

  test('the hover preview follows the pointer and comes back on leave', async ({ page }) => {
    const app = await openDemo(page);
    const set = card(app, 'table-round');
    const thumb = set.locator('.object-icons > img');
    const label = set.locator('.object-pax .hover-select-current .option-text');
    const rows = set.locator('.object-pax .hover-select-options li');

    await set.locator('.object-pax .hover-select-current').click();
    await expect(rows).toHaveCount(3);
    await expectListClearOfPicture(set, set.locator('.object-pax'));
    const seen: string[] = [];
    for (const [index, expected] of [[0, '8 seats'], [1, '6 seats'], [2, '4 seats']] as const) {
      const box = await rows.nth(index).boundingBox();
      if (!box) throw new Error('The option has no layout box');
      // Down into the row in a few small moves, as a hand would.
      for (let step = 1; step <= 4; step += 1) {
        await page.mouse.move(box.x + box.width / 2, box.y + (box.height * step) / 5);
      }
      await expect(label).toHaveText(expected);
      await expect(rows.nth(index)).toHaveClass(/current/);
      await expect(set.locator('.object-pax li.current')).toHaveCount(1);
      const src = await thumb.getAttribute('src');
      expect(seen).not.toContain(src);
      seen.push(src ?? '');
    }

    await leaveCard(page, set);
    await expect(set.locator('.object-pax')).not.toHaveAttribute('open', '');
    await expect(label).toHaveText('8 seats');
    await expect(thumb).toHaveAttribute('src', seen[0]);
  });

  test('a pick that moves the other row leaves a red dot until that row is read', async ({ page }) => {
    const app = await openDemo(page);
    const set = card(app, 'table-round');
    const seats = set.locator('.object-pax');
    const size = set.locator('.object-size');
    await set.locator('.object-icons').click();

    // Eight seats has no small table: picking the small table moves the seat count.
    await size.locator('.hover-select-current').click();
    await size.locator('.hover-select-options li').nth(1).locator('button').click();
    await expect(seats.locator('.hover-select-current')).toContainText('6 seats');
    await expect(seats).toHaveClass(/new-dot/);
    await expect(size).not.toHaveClass(/new-dot/);
    expect(await seats.evaluate((el) => getComputedStyle(el, '::before').backgroundColor)).toBe('rgb(204, 51, 51)');

    // Moving the pointer over the row reads it.
    const box = await seats.boundingBox();
    if (!box) throw new Error('The seats row has no layout box');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
    await expect(seats).not.toHaveClass(/new-dot/);

    // And the other way: eight seats at the small table falls back to the wide one.
    await seats.locator('.hover-select-current').click();
    await seats.locator('.hover-select-options li').nth(0).locator('button').click();
    await expect(size.locator('.hover-select-current')).toContainText('2.4m x 1.2m');
    await expect(size).toHaveClass(/new-dot/);
    await size.locator('.hover-select-current').click();
    await expect(size).toHaveAttribute('open', '');
    await expect(size).not.toHaveClass(/new-dot/);
  });

  test('the trail strings out behind the dot while it slides', async ({ page }) => {
    const app = await openDemo(page);
    const chair = card(app, 'chair');
    const styles = chair.locator('ul.styles');
    await expect(chair.locator('.pip-track > .pip-trail')).toHaveCount(5);

    // Sample every frame from inside the page: the slide is over in a few frames.
    const sampling = chair.locator('.pip-track').evaluate((track) => new Promise<number[][]>((resolve) => {
      const parts = [...track.children] as HTMLElement[];
      const read = () => parts.map((part) => parseFloat(getComputedStyle(part).translate));
      const frames: number[][] = [];
      const t0 = performance.now();
      const tick = (now: number) => {
        frames.push(read());
        if (now - t0 < 900) requestAnimationFrame(tick);
        else resolve(frames);
      };
      requestAnimationFrame(tick);
    }));
    await clickNextArrow(page, styles);
    const frames = await sampling;

    const dot = (frame: number[]) => frame[frame.length - 1];
    const tail = (frame: number[]) => frame[4];
    // The dot moved a pip; at some point the last part lagged it, and at the end all sit together.
    expect(Math.max(...frames.map(dot))).toBeCloseTo(18, 0);
    expect(Math.max(...frames.map((frame) => dot(frame) - tail(frame)))).toBeGreaterThan(2);
    const last = frames[frames.length - 1];
    last.forEach((value) => expect(value).toBeCloseTo(dot(last), 0));
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

test.describe('on a phone', () => {
  // The device minus its browser type, which cannot change inside a describe.
  const { defaultBrowserType, ...phone } = devices['Pixel 7'];
  void defaultBrowserType;
  test.use({ ...phone, locale: 'pt-PT' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('the walkthrough shows a different set on each seat row it hovers', async ({ page }) => {
    const stack = variantsStack(page);
    await stack.scrollIntoViewIfNeeded();
    const app = frontPage(stack, await frontPageIndex(stack)).locator('.variants-stage');
    await expect(app).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
    const set = card(app, 'table-round');
    const seats = set.locator('.object-pax');

    // Nothing touches the demo, so its own cursor works the rows. Read the card while
    // the seat list is open: each hovered row is the current one and the set it shows.
    await expect(seats).toHaveAttribute('open', '', { timeout: 30_000 });
    await expectListClearOfPicture(set, seats);
    const shown = new Map<string, string>();
    await expect.poll(async () => {
      if (await seats.getAttribute('open') === null) return shown.size;
      const current = await seats.locator('.hover-select-options li.current').getAttribute('data-value');
      const variant = await set.getAttribute('data-variant');
      if (current && variant) shown.set(current, variant);
      return shown.size;
    }, { timeout: 20_000, intervals: [100] }).toBe(3);
    expect(shown.get('8')).toBe('table-8-243');
    expect(shown.get('6')).toBe('table-6-243');
    expect(shown.get('4')).toBe('table-4-243');
  });

  test('a finger over the open list previews each row and commits the one it lifts from', async ({ page }) => {
    const app = await openDemo(page);
    const set = card(app, 'table-round');
    const seats = set.locator('.object-pax');
    const rows = seats.locator('.hover-select-options li');
    const thumb = set.locator('.object-icons > img');

    await seats.locator('.hover-select-current').tap();
    await expect(seats).toHaveAttribute('open', '');
    const first = await thumb.getAttribute('src');

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [await centre(rows.nth(0))] });
    await expect(rows.nth(0)).toHaveClass(/current/);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [await centre(rows.nth(1))] });
    await expect(set).toHaveAttribute('data-variant', 'table-6-243');
    await expect(rows.nth(1)).toHaveClass(/current/);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [await centre(rows.nth(2))] });
    await expect(set).toHaveAttribute('data-variant', 'table-4-243');
    await expect(rows.nth(2)).toHaveClass(/current/);
    expect(await thumb.getAttribute('src')).not.toBe(first);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();

    await expect(seats).not.toHaveAttribute('open', '');
    await expect(seats.locator('.hover-select-current')).toContainText('4 seats');
    await expect(set).toHaveAttribute('data-variant', 'table-4-243');
    await expect(set).toHaveClass(/active/);
  });

  test('a finger that lifts off the list puts the held set back', async ({ page }) => {
    const app = await openDemo(page);
    const set = card(app, 'table-round');
    const seats = set.locator('.object-pax');
    const rows = seats.locator('.hover-select-options li');

    await seats.locator('.hover-select-current').tap();
    await expect(seats).toHaveAttribute('open', '');
    const picture = await centre(set.locator('.object-icons'));
    await drag(page, [await centre(rows.nth(0)), await centre(rows.nth(2)), picture]);

    await expect(seats).not.toHaveAttribute('open', '');
    await expect(seats.locator('.hover-select-current')).toContainText('8 seats');
    await expect(set).toHaveAttribute('data-variant', 'table-8-243');
    await expect(set).not.toHaveClass(/active/);
  });

  test('a tap on a row picks it', async ({ page }) => {
    const app = await openDemo(page);
    const set = card(app, 'table-round');
    const seats = set.locator('.object-pax');

    await seats.locator('.hover-select-current').tap();
    await seats.locator('.hover-select-options li').nth(1).locator('button').tap();
    await expect(seats).not.toHaveAttribute('open', '');
    await expect(seats.locator('.hover-select-current')).toContainText('6 seats');
    await expect(set).toHaveAttribute('data-variant', 'table-6-243');
    await expect(set).toHaveClass(/active/);
  });
});

/** Driven by the touchscreen alone, on two real phone sizes rather than Playwright's device. */
const PHONE_VIEWPORTS = {
  '390x844': { width: 390, height: 844 },
  '360x780': { width: 360, height: 780 },
};

for (const [name, viewport] of Object.entries(PHONE_VIEWPORTS)) {
  test.describe(`touch only at ${name}`, () => {
    test.use({ viewport, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'pt-PT' });

    test.beforeEach(async ({ page }) => {
      await page.goto('/');
    });

    /** The panel with its script mounted and its walkthrough still running. */
    async function openPlaying(page: Page) {
      const stack = variantsStack(page);
      await stack.scrollIntoViewIfNeeded();
      const app = frontPage(stack, await frontPageIndex(stack)).locator('.variants-stage');
      await expect(app).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
      await expect(app).toHaveAttribute('data-user-control', 'false');
      return app;
    }

    test('a finger scrolling the page over the cards leaves the walkthrough running', async ({ page }) => {
      const app = await openPlaying(page);
      const set = card(app, 'table-round');
      const picture = await centre(set.locator('.object-icons'));
      const before = await page.evaluate(() => window.scrollY);

      // A thumb flick that starts on the picture: the browser takes it as a scroll.
      await drag(page, [
        { x: picture.x, y: picture.y + 120 },
        { x: picture.x, y: picture.y + 80 },
        { x: picture.x, y: picture.y + 30 },
        { x: picture.x, y: picture.y },
      ]);
      await expect.poll(() => page.evaluate(() => window.scrollY)).not.toBe(before);
      await page.waitForTimeout(400);
      await expect(app).toHaveAttribute('data-user-control', 'false');

      // A tap is the visitor taking over.
      const summary = await centre(set.locator('.object-pax .hover-select-current'));
      await page.touchscreen.tap(summary.x, summary.y);
      await expect(app).toHaveAttribute('data-user-control', 'true');
      await expect(set.locator('.object-pax')).toHaveAttribute('open', '');
    });

    test('a finger resting on a row shows it, and the picture and readout say so', async ({ page }) => {
      const app = await openDemo(page);
      const set = card(app, 'table-round');
      const seats = set.locator('.object-pax');
      const rows = seats.locator('.hover-select-options li');
      const thumb = set.locator('.object-icons > img');
      const running = (el: HTMLElement) => el.getAnimations().length;

      const summary = await centre(seats.locator('.hover-select-current'));
      await page.touchscreen.tap(summary.x, summary.y);
      await expect(seats).toHaveAttribute('open', '');
      await expectListClearOfPicture(set, seats);
      // Both the picture and the open list are inside the viewport.
      const list = await seats.locator('.hover-select-options').boundingBox();
      const picture = await set.locator('.object-icons').boundingBox();
      if (!list || !picture) throw new Error('The list or the picture has no layout box');
      expect(picture.y).toBeGreaterThanOrEqual(0);
      expect(list.y + list.height).toBeLessThanOrEqual(viewport.height);

      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [await centre(rows.nth(1))] });
      await expect(set).toHaveAttribute('data-variant', 'table-6-243');
      await expect(rows.nth(1)).toHaveClass(/current/);
      expect(await thumb.evaluate(running)).toBeGreaterThan(0);
      expect(await seats.locator('.hover-select-current').evaluate(running)).toBeGreaterThan(0);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();

      // Lifting where it landed is a tap, and the tap picks the row.
      await expect(seats).not.toHaveAttribute('open', '');
      await expect(seats.locator('.hover-select-current')).toContainText('6 seats');
      await expect(set).toHaveClass(/active/);
    });
  });
}

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
      CSS.supports = ((...args: Parameters<typeof CSS.supports>) => {
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
