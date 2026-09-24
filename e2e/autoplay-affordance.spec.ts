import type { Locator, Page } from '@playwright/test';

import { demoStack, frontPage, frontPageIndex, waitForIslandMounted } from './support/paperStack';
import { expect, pageWait, test } from './support/timeScale';

/**
 * The transport deck in the sheet's bottom band (see src/client/autoplayStatus.ts): cassette
 * keys, a lamp and a readout. Wherever it is drawn it has to stay on the sheet, keep off the
 * title block, and drive the walkthrough.
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
  const deck = front.locator('[data-demo-transport]');
  await expect(deck).toHaveAttribute('data-state', 'playing', { timeout: 30_000 });
  return deck;
}

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

/**
 * On a phone the deck is a row of its own above the title block. Measured as boxes: the
 * title block sits below the deck, ruled off by clear paper.
 */
function phoneRow(deck: Locator) {
  return deck.evaluate((el) => {
    const section = el.closest('section')!;
    const box = el.getBoundingClientRect();
    const title = section.querySelector('table')!.getBoundingClientRect();
    return {
      gapToTitleBlock: Math.round(title.top - box.bottom),
      spansSheet: Math.round(box.width) >= Math.round(title.width),
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
        const where = await placement(await playingDeck(stack));
        expect(where.insideSheet, 'inside the sheet').toBe(true);
        expect(where.clearOfTitleBlock, 'clear of the title block').toBe(true);
        expect(where.clearOfDrawing, 'clear of the drawing').toBe(true);
        // The band is the bottom margin on a wide sheet; a phone gives the deck a row of
        // its own inside the frame instead, above the title block.
        expect(where.insideBand, 'inside the bottom band').toBe(name === 'desktop');
      }
    });

    if (name === 'phone') {
      test('the deck spans the sheet above the title block', async ({ page }) => {
        await page.goto('/');

        for (const stack of [markerEditorStack(page), spaceBuilderStack(page)]) {
          const row = await phoneRow(await playingDeck(stack));
          expect(row.spansSheet, 'spans the sheet').toBe(true);
          expect(row.gapToTitleBlock).toBeGreaterThanOrEqual(4);
        }
      });
    }
  });
}

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

test('the deck keeps the instruction beside the state', async ({ page }) => {
  await page.goto('/');
  const deck = await playingDeck(markerEditorStack(page));
  await expect(deck.locator('[data-demo-caption]')).toHaveText('AUTO PLAYING');
  await expect(deck.locator('[data-demo-hint]')).toBeVisible();
});

/**
 * A cap the band shows through reads as an outline, not a key, which is what sent the keys
 * back for a solid fill. The cap is an SVG face, so the background to check is its fill.
 * Painting it onto a cleared pixel and reading that pixel back settles the alpha whatever
 * colour space the theme wrote the fill in: a computed `oklab(...)` cannot be matched
 * against `rgba(...)`, and the canvas keeps the space it was given.
 */
test('the transport keys sit on a solid cap', async ({ page }) => {
  await page.goto('/');
  const deck = await playingDeck(markerEditorStack(page));
  const cap = await deck.locator('[data-demo-key="play"] .key-face').evaluate((el) => {
    const fill = getComputedStyle(el).fill;
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d')!;
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = fill;
    context.fillRect(0, 0, 1, 1);
    return { fill, alpha: context.getImageData(0, 0, 1, 1).data[3] };
  });
  expect(cap.alpha, `cap fill ${cap.fill}`).toBe(255);
});
