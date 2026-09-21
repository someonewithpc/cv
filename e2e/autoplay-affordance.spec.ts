import { expect, test, type Locator, type Page } from '@playwright/test';

import { frontPage, frontPageIndex, waitForIslandMounted } from './support/paperStack';

/**
 * The transport deck comes in six shapes, chosen with `?deck=1` to `?deck=6` until one of
 * them is picked (see src/client/autoplayStatus.ts). Three are cassette keys; three are
 * marks a drawing already has. Whichever is drawn, it has to stay on the sheet, keep off
 * the title block, and drive the walkthrough.
 */
const KEY_SHAPES = ['1', '2', '3'] as const;
const MARK_SHAPES = ['4', '5', '6'] as const;
const SHAPES = [...KEY_SHAPES, ...MARK_SHAPES];

/** Shapes drawn in the bottom band, which is where a phone gives them a row of their own. */
const BAND_SHAPES = ['1', '3'];
const ROW_SHAPES = ['1', '2', '3', '4'];

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

/** The takeover every shape promises: a pointer on the drawing, moved enough to count. */
async function hoverDrawing(page: Page, stack: Locator) {
  const box = (await stack.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.6);
  await page.mouse.move(box.x + box.width * 0.42, box.y + box.height * 0.62);
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

test('the sheet keeps one margin on all four sides, whichever shape is drawn', async ({ page }) => {
  for (const shape of SHAPES) {
    await page.goto(`/?deck=${shape}`);
    const deck = await playingDeck(markerEditorStack(page));
    const margins = await deck.evaluate((el) => {
      const style = getComputedStyle(el.closest('section')!);
      return (['Top', 'Right', 'Bottom', 'Left'] as const)
        .map((side) => Math.round(parseFloat(style[`padding${side}`])));
    });
    expect(new Set(margins).size, `deck ${shape} margins ${margins.join()}`).toBe(1);
  }
});

for (const shape of SHAPES) {
  test.describe(`deck shape ${shape}`, () => {
    for (const { name, viewport } of VIEWPORTS) {
      test.describe(name, () => {
        test.use({ viewport });

        test('stays on the sheet and off the title block on both demo sheets', async ({ page }) => {
          await page.goto(`/?deck=${shape}`);

          for (const stack of [markerEditorStack(page), spaceBuilderStack(page)]) {
            const where = await placement(await playingDeck(stack));
            expect(where.insideSheet, 'inside the sheet').toBe(true);
            expect(where.clearOfTitleBlock, 'clear of the title block').toBe(true);
            // Shapes 1 and 3 fill the bottom band. Shape 2 sits on the title block, shape 4
            // on the drawing's bottom edge, and shapes 5 and 6 are marks on the drawing
            // itself. A phone gives the band shapes and shape 4 a row above the block.
            expect(where.insideBand, 'inside the bottom band')
              .toBe(name === 'desktop' && BAND_SHAPES.includes(shape));
            if (KEY_SHAPES.includes(shape as typeof KEY_SHAPES[number])) {
              expect(where.clearOfDrawing, 'clear of the drawing').toBe(true);
            }
          }
        });

        if (name === 'phone') {
          test('keeps clear of the dog-eared corner and the title block', async ({ page }) => {
            await page.goto(`/?deck=${shape}`);

            for (const stack of [markerEditorStack(page), spaceBuilderStack(page)]) {
              const row = await phoneRow(await playingDeck(stack));
              expect(row).toMatchObject({ foldVisible: true, clearOfFold: true });

              if (ROW_SHAPES.includes(shape)) {
                expect(row.spansSheet, 'spans the sheet').toBe(true);
              }
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

    // One of these two runs per shape: the keys belong to shapes 1 to 3, the single mark
    // that both takes over and hands back to shapes 4 to 6.
    const keyed = KEY_SHAPES.includes(shape as typeof KEY_SHAPES[number]);

    (keyed ? test : test.skip)('drives the walkthrough from its keys', async ({ page }) => {
      await page.goto(`/?deck=${shape}`);
      const stack = markerEditorStack(page);
      const deck = await playingDeck(stack);

      const play = deck.locator('[data-demo-key="play"]');
      const pause = deck.locator('[data-demo-key="pause"]');
      const reset = deck.locator('[data-demo-key="reset"]');

      // Big enough to aim at. A key drawn in the band is capped by the band, which is one
      // margin deep like the other three sides; shape 2's cell has the title block's room.
      const keyHeight = await play.locator('svg').evaluate((el) => el.getBoundingClientRect().height);
      expect(keyHeight).toBeGreaterThanOrEqual(shape === '2' ? 16 : 12);

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

    (keyed ? test.skip : test)('drives the walkthrough from its own mark', async ({ page }) => {
      await page.goto(`/?deck=${shape}`);
      const stack = markerEditorStack(page);
      const deck = await playingDeck(stack);

      const toggle = deck.locator('[data-demo-act="toggle"]:visible');
      const replay = deck.locator('[data-demo-act="replay"]:visible');

      if (shape === '6') {
        // The margin note writes its links only once the visitor has the walkthrough,
        // so hovering the drawing is the only way in. Everything after is on the paper.
        await expect(toggle).toHaveCount(0);
        await hoverDrawing(page, stack);
        await expect(deck).toHaveAttribute('data-state', 'user');
      } else {
        // One mark, pressed to take over. It holds past the idle resume (2s).
        await expect(toggle).toHaveCount(1);
        await toggle.click();
        await expect(deck).toHaveAttribute('data-state', 'user');
        await page.waitForTimeout(3000);
        await expect(deck).toHaveAttribute('data-state', 'user');
      }

      // The mark hands it back.
      await expect(toggle).toHaveCount(1);
      await toggle.click();
      await expect(deck).toHaveAttribute('data-state', 'playing');

      // Hovering the drawing is still the takeover every shape promises.
      await hoverDrawing(page, stack);
      await expect(deck).toHaveAttribute('data-state', 'user');

      await expect(replay).toHaveCount(1);
      await replay.click();
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

/**
 * A cap the band shows through reads as an outline, not a key, which is what sent the
 * three keyed shapes back for a solid fill. The cap is an SVG face, so the background to
 * check is its fill. Painting it onto a cleared pixel and reading that pixel back settles
 * the alpha whatever colour space the theme wrote the fill in: a computed `oklab(...)`
 * cannot be matched against `rgba(...)`, and the canvas keeps the space it was given.
 */
test('the transport keys sit on a solid cap', async ({ page }) => {
  await page.goto('/?deck=1');
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

test('shape 4 letters the state over the dimension line and advances its arrowhead', async ({ page }) => {
  await page.goto('/?deck=4');
  const deck = await playingDeck(markerEditorStack(page));

  await expect(deck.locator('[data-demo-dimension-state]')).toHaveText('AUTO PLAYING');
  await expect(deck.locator('[data-demo-dimension-hint]')).toHaveText(/take over/);

  // The marker editor's walkthrough is a numbered list of steps, so the line is ticked
  // off one per step and the arrowhead moves as they run.
  await expect(deck).toHaveAttribute('data-progress', 'counted');
  const reading = () => deck.evaluate((el) => el.style.getPropertyValue('--deck-progress'));
  const first = await reading();
  await expect.poll(reading, { timeout: 30_000 }).not.toBe(first);

  await deck.locator('[data-demo-act="toggle"]:visible').click();
  await expect(deck.locator('[data-demo-dimension-state]')).toHaveText('YOU ARE DRIVING');
  await expect(deck.locator('[data-demo-dimension-hint]')).toHaveText(/hand back/);

  // Taken over means stopped: the arrowhead stays where the walkthrough left it.
  const held = await reading();
  await page.waitForTimeout(3000);
  expect(await reading()).toBe(held);
});

test('shape 5 re-inks the stamp when the visitor takes over', async ({ page }) => {
  await page.goto('/?deck=5');
  const deck = await playingDeck(markerEditorStack(page));

  const stamp = deck.locator('[data-demo-stamp-state]');
  await expect(stamp).toHaveText('AUTO PLAY');
  await expect(deck.locator('[data-demo-stamp-hint]')).toHaveText(/take over/);

  await deck.locator('[data-demo-act="toggle"]:visible').click();
  await expect(stamp).toHaveText('HELD BY YOU');
  await expect(deck.locator('[data-demo-stamp-hint]')).toHaveText(/hand back/);
});

test('shape 6 strikes its note out and writes the next line', async ({ page }) => {
  await page.goto('/?deck=6');
  const stack = markerEditorStack(page);
  const deck = await playingDeck(stack);

  const first = deck.locator('[data-demo-note-line]');
  const second = deck.locator('.note-second');
  await expect(first).toHaveText(/playing itself/);
  await expect(second).toBeHidden();

  await hoverDrawing(page, stack);
  await expect(deck).toHaveAttribute('data-state', 'user');
  await expect(second).toBeVisible();
  await expect(deck.getByRole('button', { name: 'hand back' })).toBeVisible();
  await expect(deck.getByRole('button', { name: 'replay' })).toBeVisible();

  // The pencil stroke is drawn across the line rather than underlined by the font, so
  // what proves it landed is the stroke's own box, not a text-decoration.
  const struck = await first.evaluate((el) => {
    const stroke = getComputedStyle(el, '::after');
    return { width: parseFloat(stroke.width), scale: stroke.scale };
  });
  expect(struck.width).toBeGreaterThan(20);
  expect(struck.scale).not.toBe('0 1');
});
