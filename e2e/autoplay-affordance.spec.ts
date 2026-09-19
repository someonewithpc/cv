import { expect, test, type Locator, type Page } from '@playwright/test';

import { frontPage, frontPageIndex, waitForIslandMounted } from './support/paperStack';

/**
 * The transport deck comes in three shapes, chosen with `?deck=1|2|3` until one of them is
 * picked (see src/client/autoplayStatus.ts). Whichever is drawn, it has to keep off the
 * drawing and off the title block, and its keys have to drive the walkthrough.
 */
const SHAPES = ['1', '2', '3'] as const;

const VIEWPORTS = [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'phone', viewport: { width: 390, height: 844 } },
];

function markerEditorStack(page: Page) {
  return page.locator('article.technical-drawing-stack').nth(1);
}

function spaceBuilderStack(page: Page) {
  return page.locator('article.technical-drawing-stack').nth(2);
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
 * On a phone the deck is a row of its own above the title block, out of reach of the
 * dog-eared corner that the note folds out of. Measured as boxes: the corner's box may
 * not cross the deck's, and the title block sits below the deck, either sharing its rule
 * (shape 2) or ruled off by clear paper.
 */
function phoneRow(deck: Locator) {
  return deck.evaluate((el) => {
    const section = el.closest('section')!;
    const box = el.getBoundingClientRect();
    const fold = section.querySelector('.note-fold')!.getBoundingClientRect();
    const title = section.querySelector('table')!.getBoundingClientRect();
    return {
      foldVisible: fold.width > 0 && fold.height > 0,
      clearOfFold: box.right <= fold.left || box.left >= fold.right
        || box.bottom <= fold.top || box.top >= fold.bottom,
      gapToTitleBlock: Math.round(title.top - box.bottom),
      spansSheet: Math.round(box.width) >= Math.round(title.width),
    };
  });
}

test('the deck shape follows ?deck, and an unknown one falls back to the first', async ({ page }) => {
  for (const shape of SHAPES) {
    await page.goto(`/?deck=${shape}`);
    await playingDeck(markerEditorStack(page));
    await expect(page.locator('html')).toHaveAttribute('data-deck', shape);
  }

  await page.goto('/?deck=jukebox');
  await playingDeck(markerEditorStack(page));
  await expect(page.locator('html')).toHaveAttribute('data-deck', '1');
});

for (const shape of SHAPES) {
  test.describe(`deck shape ${shape}`, () => {
    for (const { name, viewport } of VIEWPORTS) {
      test.describe(name, () => {
        test.use({ viewport });

        test('keeps off the drawing and off the title block on both demo sheets', async ({ page }) => {
          await page.goto(`/?deck=${shape}`);

          for (const stack of [markerEditorStack(page), spaceBuilderStack(page)]) {
            const deck = await playingDeck(stack);
            expect(await placement(deck)).toEqual({
              insideSheet: true,
              // Shapes 1 and 3 fill the bottom band; shape 2 sits on the title block instead.
              // A phone draws every shape as a row above the title block (see below).
              insideBand: name === 'desktop' && shape !== '2',
              clearOfDrawing: true,
              clearOfTitleBlock: true,
            });
          }
        });

        if (name === 'phone') {
          test('takes a row above the title block, clear of the dog-eared corner', async ({ page }) => {
            await page.goto(`/?deck=${shape}`);

            for (const stack of [markerEditorStack(page), spaceBuilderStack(page)]) {
              const row = await phoneRow(await playingDeck(stack));
              expect(row).toMatchObject({ foldVisible: true, clearOfFold: true, spansSheet: true });
              if (shape === '2') {
                // Its cell shares the block's top rule.
                expect(Math.abs(row.gapToTitleBlock)).toBeLessThanOrEqual(1);
              } else {
                expect(row.gapToTitleBlock).toBeGreaterThanOrEqual(4);
              }
            }
          });
        }
      });
    }

    test('drives the walkthrough from its keys', async ({ page }) => {
      await page.goto(`/?deck=${shape}`);
      const stack = markerEditorStack(page);
      const deck = await playingDeck(stack);

      const play = deck.locator('[data-demo-key="play"]');
      const pause = deck.locator('[data-demo-key="pause"]');
      const reset = deck.locator('[data-demo-key="reset"]');

      // Big enough to aim at: the point of shapes 1 and 2 is keys you can read.
      const keyHeight = await play.locator('svg').evaluate((el) => el.getBoundingClientRect().height);
      expect(keyHeight).toBeGreaterThanOrEqual(shape === '3' ? 12 : 16);

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
      await page.waitForTimeout(3000);
      await expect(deck).toHaveAttribute('data-state', 'user');

      await reset.click();
      await expect(deck).toHaveAttribute('data-state', 'playing');
    });
  });
}

test('shape 3 leads with the instruction and then settles on the state', async ({ page }) => {
  await page.goto('/?deck=3');
  const deck = await playingDeck(markerEditorStack(page));
  const caption = deck.locator('[data-demo-caption]');
  const hint = deck.locator('[data-demo-hint]');

  // Set back rather than caught on the way past: the six second lead can be over before a
  // slow mount hands control back to the test.
  await deck.evaluate((el) => { el.dataset.phase = 'intro'; });
  await expect(hint).toBeVisible();
  await expect(hint).toHaveText(/take over/);
  await expect(caption).toBeHidden();

  await expect(deck).toHaveAttribute('data-phase', 'settled', { timeout: 15_000 });
  await expect(caption).toHaveText('AUTO PLAYING');
  await expect(hint).toBeHidden();
});

test('shape 1 keeps the instruction beside the state', async ({ page }) => {
  await page.goto('/?deck=1');
  const deck = await playingDeck(markerEditorStack(page));
  await expect(deck.locator('[data-demo-caption]')).toHaveText('AUTO PLAYING');
  await expect(deck.locator('[data-demo-hint]')).toBeVisible();
});

test('shape 2 reads the state as a title block value', async ({ page }) => {
  await page.goto('/?deck=2');
  const deck = await playingDeck(markerEditorStack(page));
  await expect(deck.locator('[data-demo-value]')).toHaveText('Playing');
  await expect(deck.getByText('Auto play', { exact: true })).toBeVisible();
});
