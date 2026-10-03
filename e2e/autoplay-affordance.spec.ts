import type { Locator, Page } from '@playwright/test';

import { demoStack, frontDeck, frontPage, frontPageIndex, waitForIslandMounted } from './support/paperStack';
import { expect, pageWait, test } from './support/timeScale';

/**
 * The transport deck in the sheet's bottom band (see src/client/autoplayStatus.ts): cassette
 * keys, a lamp and a readout. On a landscape sheet it stays in the band, off the title block; a
 * portrait sheet's band cannot hold it, so it moves under the page into the callout's card
 * (TechnicalDrawing/deck-home.ts). Wherever it is, it drives the walkthrough.
 */
const VIEWPORTS = [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'phone', viewport: { width: 390, height: 844 } },
];

function markerEditorStack(page: Page) {
  return demoStack(page, 'Interactive Map Marker Editor');
}

function spaceBuilderStack(page: Page) {
  return demoStack(page, 'Space Builder · Add Tool');
}

async function playingDeck(stack: Locator): Promise<Locator> {
  // Centred, not just nudged into view: a demo only drives itself, and so only reports to
  // the deck, while its page counts as active.
  await stack.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const front = frontPage(stack, await frontPageIndex(stack));
  await waitForIslandMounted(front);
  const deck = frontDeck(stack, front);
  await expect(deck).toHaveAttribute('data-state', 'playing', { timeout: 30_000 });
  return deck;
}

/** Every callout whose demo drives itself, so its sheet shows a deck at full motion. */
const DECK_DETAILS = ['b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'o'];

/** Where the deck sits, measured against the sheet it is drawn on. */
function placement(deck: Locator) {
  return deck.evaluate((el) => {
    const section = el.closest('section')!;
    const sheet = section.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    const band = parseFloat(getComputedStyle(section).paddingBottom);
    const clearOf = (other: Element | null) => {
      if (!other) return false;
      const b = other.getBoundingClientRect();
      return box.right <= b.left + 1 || box.left >= b.right - 1
        || box.bottom <= b.top + 1 || box.top >= b.bottom - 1;
    };
    return {
      insideSheet: box.left >= sheet.left - 1 && box.right <= sheet.right + 1
        && box.top >= sheet.top - 1 && box.bottom <= sheet.bottom + 1,
      insideBand: box.top >= sheet.bottom - band - 1 && box.bottom <= sheet.bottom + 1,
      clearOfDrawing: clearOf(section.querySelector('.content')),
      clearOfTitleBlock: clearOf(section.querySelector('table')),
    };
  });
}

/** Where a deck in the callout's card sits: under the stack it belongs to, as the slip's first
 *  entry, over the title. */
function cardPlacement(deck: Locator) {
  return deck.evaluate((el) => {
    const callout = el.closest('section.callout')!;
    const stack = callout.querySelector('article.technical-drawing-stack')!.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    const title = callout.querySelector('.callout-card .title-cell dt')!.getBoundingClientRect();
    return {
      inCard: el.parentElement!.matches('.callout-card'),
      first: el === el.parentElement!.firstElementChild && box.bottom <= title.top,
      underStack: box.top >= stack.bottom - 1,
      withinStackWidth: box.left >= stack.left - 1 && box.right <= stack.right + 1,
    };
  });
}

test('the sheet keeps one margin on all four sides', async ({ page }) => {
  await page.goto('/');
  const deck = await playingDeck(markerEditorStack(page));
  const margins = await deck.evaluate((el) => {
    const style = getComputedStyle(el.closest('section')!);
    return (['Top', 'Right', 'Bottom', 'Left'] as const)
      .map((side) => Math.round(parseFloat(style[`padding${side}`])));
  });
  expect(new Set(margins).size, `margins ${margins.join()}`).toBe(1);
});

for (const { name, viewport } of VIEWPORTS) {
  test.describe(name, () => {
    test.use({ viewport });

    test('the deck stays on the sheet and off the title block on both demo sheets', async ({ page }) => {
      await page.goto('/');

      for (const stack of [markerEditorStack(page), spaceBuilderStack(page)]) {
        const deck = await playingDeck(stack);
        if (name === 'desktop') {
          const where = await placement(deck);
          expect(where.insideSheet, 'inside the sheet').toBe(true);
          expect(where.insideBand, 'inside the bottom band').toBe(true);
          expect(where.clearOfTitleBlock, 'clear of the title block').toBe(true);
          expect(where.clearOfDrawing, 'clear of the drawing').toBe(true);
        } else {
          // A phone sheet's band is shallower than a key, so the deck is under the page.
          expect(await cardPlacement(deck)).toEqual({ inCard: true, first: true, underStack: true, withinStackWidth: true });
        }
      }
    });
  });
}

/**
 * L9: the deck stays in the band wherever the band holds it and moves to the card where it
 * does not, on every demo with a deck. 680 is the widest portrait sheet and 681 the narrowest
 * landscape one.
 */
for (const [width, home] of [[390, 'card'], [680, 'card'], [681, 'band'], [1440, 'band']] as const) {
  test(`every demo's deck is in the ${home} at ${width}px`, async ({ page }) => {
    test.slow();
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    for (const id of DECK_DETAILS) {
      const callout = page.locator(`section.callout[aria-labelledby="detail-${id}"]`);
      await callout.evaluate((el) => el.scrollIntoView({ block: 'center' }));
      const deck = callout.locator('[data-demo-transport]:not([hidden])');
      await expect(deck, id).toHaveCount(1, { timeout: 30_000 });
      if (home === 'card') {
        expect(await cardPlacement(deck), id).toEqual({ inCard: true, first: true, underStack: true, withinStackWidth: true });
      } else {
        const where = await placement(deck);
        expect(where.insideBand, `${id} in the band`).toBe(true);
        expect(where.clearOfTitleBlock, `${id} clear of the title block`).toBe(true);
      }
    }
  });
}

test('the deck goes back to the band when the sheet turns landscape, and still drives the demo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const stack = markerEditorStack(page);
  const deck = await playingDeck(stack);
  expect((await cardPlacement(deck)).inCard).toBe(true);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(async () => (await placement(deck)).insideBand).toBe(true);
  await deck.locator('[data-demo-key="pause"]').click();
  await expect(deck).toHaveAttribute('data-state', 'user');
});

test('the deck drives the walkthrough from its keys', { tag: '@handover' }, async ({ page }) => {
  await page.goto('/');
  const stack = markerEditorStack(page);
  const deck = await playingDeck(stack);

  const play = deck.locator('[data-demo-key="play"]');
  const pause = deck.locator('[data-demo-key="pause"]');
  const reset = deck.locator('[data-demo-key="reset"]');

  // Big enough to aim at. A key drawn in the band is capped by the band, which is one
  // margin deep like the other three sides.
  const keyHeight = await play.locator('svg').evaluate((el) => el.getBoundingClientRect().height);
  expect(keyHeight).toBeGreaterThanOrEqual(12);

  await expect(play).toHaveAttribute('aria-pressed', 'true');
  await expect(pause).toHaveAttribute('aria-pressed', 'false');

  // Hovering the sheet is the takeover the deck promises.
  const box = (await stack.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.6);
  await page.mouse.move(box.x + box.width * 0.42, box.y + box.height * 0.62);
  await expect(deck).toHaveAttribute('data-state', 'user');
  await expect(pause).toHaveAttribute('aria-pressed', 'true');

  await play.click();
  await expect(deck).toHaveAttribute('data-state', 'playing');

  // Pause is the explicit takeover, and it holds past the idle resume (2s).
  await pause.click();
  await expect(deck).toHaveAttribute('data-state', 'user');
  await pageWait(page, 3000);
  await expect(deck).toHaveAttribute('data-state', 'user');

  await reset.click();
  await expect(deck).toHaveAttribute('data-state', 'playing');
});

test('a deck press gives the pointer a second to leave the key before it takes over', async ({ page }) => {
  await page.goto('/');
  const stack = markerEditorStack(page);
  const deck = await playingDeck(stack);
  const reset = deck.locator('[data-demo-key="reset"]');
  const box = (await stack.boundingBox())!;
  const onSheet = (fx: number) => page.mouse.move(box.x + box.width * fx, box.y + box.height * 0.6);

  await reset.click();
  await onSheet(0.4);
  await onSheet(0.42);
  await expect(deck).toHaveAttribute('data-state', 'playing');

  // A press on the sheet itself is deliberate, so it takes over at once.
  await page.mouse.down();
  await page.mouse.up();
  await expect(deck).toHaveAttribute('data-state', 'user');

  await reset.click();
  await pageWait(page, 1200);
  await onSheet(0.4);
  await onSheet(0.42);
  await expect(deck).toHaveAttribute('data-state', 'user');
});

test('the deck keeps the instruction beside the state', async ({ page }) => {
  await page.goto('/');
  const deck = await playingDeck(markerEditorStack(page));
  await expect(deck.locator('[data-demo-caption]')).toHaveText('AUTO PLAYING');
  await expect(deck.locator('[data-demo-hint]')).toBeVisible();
});

/**
 * A cap the band shows through reads as an outline, not a key, which is what sent the keys
 * back for a solid fill. The cap is an SVG face drawn once for the page and shown on each
 * key through <use>, out of reach of a query, so the fill to check is the one the key hands
 * down to it (--key-face-fill, Page.astro). Painting it onto a cleared pixel and reading
 * that pixel back settles the alpha whatever colour space the theme wrote the fill in: a
 * computed `oklab(...)` cannot be matched against `rgba(...)`, and the canvas keeps the
 * space it was given.
 */
test('the transport keys sit on a solid cap', async ({ page }) => {
  await page.goto('/');
  const deck = await playingDeck(markerEditorStack(page));
  const cap = await deck.locator('[data-demo-key="play"]').evaluate((el) => {
    const fill = getComputedStyle(el).getPropertyValue('--key-face-fill').trim();
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d')!;
    context.clearRect(0, 0, 1, 1);
    // A fill the canvas cannot parse keeps the old style; transparent makes that a failure.
    context.fillStyle = 'transparent';
    context.fillStyle = fill;
    context.fillRect(0, 0, 1, 1);
    return { fill, alpha: context.getImageData(0, 0, 1, 1).data[3] };
  });
  expect(cap.alpha, `cap fill ${cap.fill}`).toBe(255);
});
