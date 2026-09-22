import { expect, test, type Locator, type Page } from '@playwright/test';

import {
  armDrawCounter,
  frontPage,
  frontPageIndex,
  sceneDraws,
  swipeToPage,
  waitForIslandMounted,
} from './support/paperStack';

/** Last stack on the page, after the logo, marker editor and the other Space Builder sheets. */
function dragDropStack(page: Page) {
  return page.locator('article.technical-drawing-stack').nth(6);
}

/** The scene app marks its own root `data-ready="true"` once Three.js has finished loading. */
async function openDemo(page: Page): Promise<Locator> {
  const stack = dragDropStack(page);
  await stack.scrollIntoViewIfNeeded();
  const front = frontPage(stack, await frontPageIndex(stack));
  const island = await waitForIslandMounted(front);
  const app = island.locator('[data-ready]');
  await expect(app).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
  return app;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('the scene loads with the catalog beside it', async ({ page }) => {
  const app = await openDemo(page);
  await expect(app.locator('canvas[data-scene-canvas]')).toBeVisible();
  await expect(app.getByRole('heading', { name: 'Select an Object' })).toBeVisible();

  // This page runs its own pointer drag rather than native HTML5 drag, so the chair
  // item is deliberately not `draggable`.
  const chair = app.locator('[data-demo-target="catalog:chair"]');
  await expect(chair).toBeVisible();
  await expect(chair).toHaveAttribute('draggable', 'false');
});

test('a single click only highlights a card', async ({ page }) => {
  const app = await openDemo(page);
  await app.locator('[data-demo-target="catalog:table-round"]').click();
  await expect(app).toHaveAttribute('data-phase', 'idle');
});

test('double-clicking an object places one on the next floor click, then goes back to view', async ({ page }) => {
  const app = await openDemo(page);
  const table = app.locator('[data-demo-target="catalog:table-round"]');
  const canvas = app.locator('canvas[data-scene-canvas]');

  await table.dblclick();
  await expect(app).toHaveAttribute('data-phase', 'armed');

  const box = await canvas.boundingBox();
  if (!box) throw new Error('Scene canvas has no layout box');

  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.5);
  // `Single.end()` selects what it placed, so the floor shows the product's green highlight.
  await expect(app).toHaveAttribute('data-selected', 'true');

  // Space Builder's Single subaction commits the object and sets the editor back to `view`.
  // Nothing rides the pointer afterwards, so a second click cannot place a second object.
  await expect(app).toHaveAttribute('data-phase', 'idle');
});

test('Esc drops an armed object instead of placing it', async ({ page }) => {
  const app = await openDemo(page);
  await app.locator('[data-demo-target="catalog:table-round"]').dblclick();
  await expect(app).toHaveAttribute('data-phase', 'armed');
  await app.press('Escape');
  await expect(app).toHaveAttribute('data-phase', 'idle');
});

test('dragging an object onto the floor places exactly one in a live scene', async ({ page }) => {
  await armDrawCounter(page);
  const app = await openDemo(page);
  const chair = app.locator('[data-demo-target="catalog:chair"]');
  const canvas = app.locator('canvas[data-scene-canvas]');
  const from = await chair.boundingBox();
  const to = await canvas.boundingBox();
  if (!from || !to) throw new Error('Catalog item or scene canvas has no layout box');

  // A real pointer sequence with intermediate moves: this page runs its own pointer drag,
  // so `dragTo`'s drag events would never reach it.
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const drop = { x: to.x + to.width * 0.45, y: to.y + to.height * 0.55 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let step = 1; step <= 10; step += 1) {
    await page.mouse.move(
      start.x + ((drop.x - start.x) * step) / 10,
      start.y + ((drop.y - start.y) * step) / 10,
    );
    await page.waitForTimeout(40);
  }
  await page.mouse.up();

  await expect(app).toHaveAttribute('data-selected', 'true');
  // A drop ends the drag, unlike a click, which leaves the object on the pointer.
  await expect(app).toHaveAttribute('data-phase', 'idle');

  // The chair has to land in the scene that owns the WebGL context, or the drop is real
  // but nothing is ever drawn.
  const drawnOnDrop = await sceneDraws(app);
  await expect.poll(() => sceneDraws(app), { timeout: 20_000 }).toBeGreaterThan(drawnOnDrop);
});

test('the picture riding the pointer over the catalog carries the card tile', async ({ page }) => {
  const app = await openDemo(page);
  const chair = app.locator('[data-demo-target="catalog:chair"]');
  const tile = await chair.boundingBox();
  if (!tile) throw new Error('Catalog item has no layout box');

  // Straight down from the press, so the pointer never leaves the sidebar and the scene's
  // ghost never takes over.
  const start = { x: tile.x + tile.width / 2, y: tile.y + tile.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let step = 1; step <= 6; step += 1) {
    await page.mouse.move(start.x, start.y + step * 6);
    await page.waitForTimeout(20);
  }

  const ghost = app.locator('.demo-drag-thumb');
  await expect(ghost).toBeVisible();
  const carried = await ghost.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const picture = el.querySelector('img')!;
    return {
      width: Math.round(box.width),
      height: Math.round(box.height),
      background: getComputedStyle(el).backgroundImage,
      pictureWidth: Math.round(picture.getBoundingClientRect().width),
    };
  });
  await page.mouse.up();

  // What crosses the catalog is the card's flat picture, tile and all, not a cut-out of
  // the chair: the tile's own gradient, at the tile's own size.
  expect(carried.background).toContain('linear-gradient');
  expect(carried.width).toBe(Math.round(tile.width));
  expect(carried.height).toBe(Math.round(tile.height));
  // And the picture inside fills that tile rather than spilling out of it.
  expect(carried.pictureWidth).toBe(carried.width);
});

/** The sizes the sheet and its frames were measured at in earlier rounds. */
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
];

test('every catalog picture stays inside its own tile and off its label', async ({ page }) => {
  const app = await openDemo(page);

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await dragDropStack(page).scrollIntoViewIfNeeded();
    // The sidebar reflows with the sheet's orientation; measure after it has settled.
    await page.waitForTimeout(400);

    const cards = await app.locator('[data-catalog-item]').evaluateAll((items) =>
      items.map((item) => {
        const picture = item.querySelector('.object-icons img')!.getBoundingClientRect();
        const tile = item.querySelector('.object-icons')!.getBoundingClientRect();
        const label = item.querySelector('.item-label')?.getBoundingClientRect() ?? null;
        return {
          id: item.getAttribute('data-catalog-item'),
          picture: { left: picture.left, right: picture.right, top: picture.top, bottom: picture.bottom },
          tile: { left: tile.left, right: tile.right, top: tile.top, bottom: tile.bottom },
          labelTop: label ? label.top : null,
        };
      }),
    );
    expect(cards.length).toBeGreaterThan(0);

    const SLACK = 0.5;
    for (const card of cards) {
      const where = `${card.id} at ${viewport.width}x${viewport.height}`;
      expect(card.picture.left, `${where} spills left of its tile`).toBeGreaterThanOrEqual(card.tile.left - SLACK);
      expect(card.picture.right, `${where} spills right of its tile`).toBeLessThanOrEqual(card.tile.right + SLACK);
      expect(card.picture.top, `${where} spills above its tile`).toBeGreaterThanOrEqual(card.tile.top - SLACK);
      expect(card.picture.bottom, `${where} spills below its tile`).toBeLessThanOrEqual(card.tile.bottom + SLACK);
      if (card.labelTop !== null) {
        expect(card.picture.bottom, `${where} covers its own label`).toBeLessThanOrEqual(card.labelTop + SLACK);
      }
    }
  }
});

test('autoplay runs and hands over to the visitor', async ({ page }) => {
  const app = await openDemo(page);
  const playing = app.locator('.demo-flash');
  await expect(playing).toBeVisible({ timeout: 25_000 });

  await app.locator('[data-demo-target="catalog:chair"]').click();
  await expect(playing).toBeHidden();
});

/** An ordinary desktop window, and the size the sheet is as wide as it ever gets at. */
const DESKTOP_WINDOW = { width: 1366, height: 768 };

test('the scene, the catalog and the note fit the artwork, clear of the title block', async ({ page }) => {
  await page.setViewportSize(DESKTOP_WINDOW);
  await page.goto('/');
  const app = await openDemo(page);

  const boxes = await app.evaluate((root) => {
    const box = (el: Element) => {
      const { left, top, right, bottom } = el.getBoundingClientRect();
      return { left, top, right, bottom };
    };
    const sheet = root.closest('section')!;
    const mat = Number.parseFloat(getComputedStyle(sheet).paddingBottom);
    const edge = box(sheet);
    return {
      // Inside the mat is the drawn area — the sheet's own padding box.
      artwork: {
        left: edge.left + mat,
        top: edge.top + mat,
        right: edge.right - mat,
        bottom: edge.bottom - mat,
      },
      cell: box(sheet.querySelector(':scope > .content')!),
      titleBlock: box(sheet.querySelector(':scope > table')!),
      canvas: box(root.querySelector('canvas[data-scene-canvas]')!),
      catalog: box(root.querySelector('.sidebar')!),
      note: box(sheet.querySelector('.aside .note-card > aside')!),
    };
  });

  const SLACK = 1;
  // The title block is absolutely placed in the sheet's bottom-right corner, over the
  // artwork column and the note's column both. Nothing else reaches into that corner: the
  // demo once filled the whole cell and ran the catalog under the block's own lettering.
  for (const part of ['canvas', 'catalog', 'note'] as const) {
    const { left, top, right, bottom } = boxes[part];
    expect(left, `${part} past the mat's left edge`).toBeGreaterThanOrEqual(boxes.artwork.left - SLACK);
    expect(right, `${part} past the mat's right edge`).toBeLessThanOrEqual(boxes.artwork.right + SLACK);
    expect(top, `${part} above the mat`).toBeGreaterThanOrEqual(boxes.artwork.top - SLACK);
    expect(bottom, `${part} below the mat`).toBeLessThanOrEqual(boxes.artwork.bottom + SLACK);
    expect(bottom, `${part} over the title block`).toBeLessThanOrEqual(boxes.titleBlock.top + SLACK);
  }

  // The scene and the catalog keep to the artwork cell rather than spilling into the note's
  // column, and they still take most of the height the cell has above the block — fitting
  // the corner by shrinking to nothing would pass everything above.
  for (const part of ['canvas', 'catalog'] as const) {
    expect(boxes[part].left, `${part} left of the artwork cell`).toBeGreaterThanOrEqual(boxes.cell.left - SLACK);
    expect(boxes[part].right, `${part} right of the artwork cell`).toBeLessThanOrEqual(boxes.cell.right + SLACK);
  }
  const room = boxes.titleBlock.top - boxes.cell.top;
  expect(boxes.canvas.bottom - boxes.canvas.top).toBeGreaterThan(0.8 * room);
});

test('the second sheet shows the handoff in four frames of the demo and few words', async ({ page }) => {
  const stack = dragDropStack(page);
  await stack.scrollIntoViewIfNeeded();
  await expect(stack.locator(':scope > div')).toHaveCount(2);

  await swipeToPage(page, stack, 'Picture to Model', 2);
  const front = frontPage(stack, await frontPageIndex(stack));
  const layer = front.locator('[data-handoff-layer]');
  await expect(layer).toBeVisible();
  await expect(layer.locator('img[src^="/demos/drag-drop/handoff-"]')).toHaveCount(4);
  await expect(layer.locator('figcaption')).toHaveCount(4);

  const words = await front.evaluate((page) => {
    const text = [
      page.querySelector<HTMLElement>('[data-handoff-layer]')?.innerText ?? '',
      page.querySelector<HTMLElement>('.aside')?.innerText ?? '',
    ].join(' ');
    return text.split(/\s+/).filter((word) => /\w/.test(word)).length;
  });
  // The sheet says all of it now: a heading, the line under it, and the four captions come
  // to 63 words, where the page used to hand a third of its width to an eight-word note.
  expect(words).toBeLessThan(75);
});

/** What the four captions say, in the order the frames run. */
const HANDOFF_CAPTIONS = [
  'drag the object to the viewport',
  'over the catalog it is still a picture',
  'over the floor it becomes the model',
  'let go and it is placed',
];

/** A phone held upright, the size the frames and their captions have the least room on. */
const PORTRAIT_PHONE = { width: 390, height: 844 };

for (const phone of [false, true]) {
  test(`the handoff captions read in frame order, each under its own frame${phone ? ', on a phone' : ''}`, async ({ page }) => {
    if (phone) {
      await page.setViewportSize(PORTRAIT_PHONE);
      await page.goto('/');
    }
    const stack = dragDropStack(page);
    await stack.scrollIntoViewIfNeeded();
    await swipeToPage(page, stack, 'Picture to Model', 2);
    const layer = frontPage(stack, await frontPageIndex(stack)).locator('[data-handoff-layer]');
    await expect(layer).toBeVisible();

    const frames = await layer.evaluate((root) => {
      const box = (el: Element) => {
        const { left, top, right, bottom } = el.getBoundingClientRect();
        return { left, top, right, bottom };
      };
      return [...root.querySelectorAll('figure.frame')].map((frame) => ({
        text: frame.querySelector('figcaption')!.textContent?.trim() ?? '',
        caption: box(frame.querySelector('figcaption')!),
        picture: box(frame.querySelector('img')!),
        frame: box(frame),
        sheet: box(frame.closest('section')!),
      }));
    });

    expect(frames.map((frame) => frame.text)).toEqual(HANDOFF_CAPTIONS);

    // A caption is set under the picture it names and no wider than it, so the eye that
    // reads one knows which still it belongs to, and it stays on the sheet.
    const SLACK = 1;
    for (const { text, caption, picture, frame, sheet } of frames) {
      expect(caption.top, `"${text}" is not under its frame`).toBeGreaterThanOrEqual(picture.bottom - SLACK);
      expect(caption.left, `"${text}" past its frame's left edge`).toBeGreaterThanOrEqual(frame.left - SLACK);
      expect(caption.right, `"${text}" past its frame's right edge`).toBeLessThanOrEqual(frame.right + SLACK);
      expect(caption.left >= sheet.left && caption.right <= sheet.right, `"${text}" off the sheet`).toBe(true);
    }

    // And the frames themselves run in reading order, so the drag reads left to right (or,
    // on a phone, row by row) rather than in whatever order the grid happened to lay them.
    for (const [index, { text, frame }] of frames.entries()) {
      if (index === 0) continue;
      const before = frames[index - 1].frame;
      const after = frame.top > before.top + SLACK || frame.left >= before.right - SLACK;
      expect(after, `"${text}" comes before the frame it follows`).toBe(true);
    }
  });
}

/** A wide window, where the sheet has the most room for the panel to run past its column. */
const DESKTOP = { width: 1440, height: 900 };

test('the handoff panel stays out of the title block and the note', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  const stack = dragDropStack(page);
  await stack.scrollIntoViewIfNeeded();
  await swipeToPage(page, stack, 'Picture to Model', 2);
  const layer = frontPage(stack, await frontPageIndex(stack)).locator('[data-handoff-layer]');
  await expect(layer).toBeVisible();

  const boxes = await layer.evaluate((root) => {
    const box = (el: Element) => {
      const { left, top, right, bottom } = el.getBoundingClientRect();
      return { left, top, right, bottom };
    };
    const sheet = root.closest('section')!;
    const mat = Number.parseFloat(getComputedStyle(sheet).paddingBottom);
    const edge = box(sheet);
    return {
      mat,
      artwork: { left: edge.left + mat, top: edge.top + mat, right: edge.right - mat, bottom: edge.bottom - mat },
      panel: box(root.querySelector('.panel')!),
      // The title block is the sheet's own corner table; a note would be its third column.
      titleBlock: box(sheet.querySelector(':scope > table')!),
      note: sheet.querySelector('.aside .note-card > *') ? 'yes' : 'none',
    };
  });

  // This page says everything on its own plate, so it keeps no column for a note and the
  // block's corner is the only part of the sheet the panel has to stay out of.
  expect(boxes.note).toBe('none');
  expect(boxes.panel.bottom).toBeLessThanOrEqual(boxes.titleBlock.top);

  // The plate floats inside the border rather than running up against it: a gutter of the
  // sheet's own mat on the two sides and the top, and the block's corner below.
  expect(boxes.panel.left - boxes.artwork.left).toBeGreaterThanOrEqual(boxes.mat - 1);
  expect(boxes.artwork.right - boxes.panel.right).toBeGreaterThanOrEqual(boxes.mat - 1);
  expect(boxes.panel.top - boxes.artwork.top).toBeGreaterThanOrEqual(boxes.mat - 1);

  // And what is left of the artwork's width is still nearly all of it, which is what gives
  // a row of four frames the room to be four frames.
  const artworkWidth = boxes.artwork.right - boxes.artwork.left;
  expect(boxes.panel.right - boxes.panel.left).toBeGreaterThanOrEqual(0.85 * artworkWidth);
});

test('every frame is the same size, and big enough to read', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  const stack = dragDropStack(page);
  await stack.scrollIntoViewIfNeeded();
  await swipeToPage(page, stack, 'Picture to Model', 2);
  const layer = frontPage(stack, await frontPageIndex(stack)).locator('[data-handoff-layer]');
  await expect(layer).toBeVisible();

  const pictures = await layer.evaluate((root) =>
    [...root.querySelectorAll('figure.frame img')].map((img) => {
      const { width, height } = img.getBoundingClientRect();
      return { width: Math.round(width), height: Math.round(height) };
    }),
  );
  expect(pictures).toHaveLength(4);

  // One caption running to two lines used to shorten its own picture alone; the frames
  // share their rows now, so the four stills read as one strip.
  for (const picture of pictures) expect(picture).toEqual(pictures[0]);

  // The frames grow into whatever height the plate has left. At 1440x900 that is about
  // 209x220, where a row of four sized off its width alone came to 219x125.
  expect(pictures[0].width).toBeGreaterThanOrEqual(195);
  expect(pictures[0].height).toBeGreaterThanOrEqual(195);
});

test('the sidebar title stays inside its header, wrapping if it has to', async ({ page }) => {
  for (const viewport of [DESKTOP, PORTRAIT_PHONE]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const app = await openDemo(page);
    const fit = await app.locator('.sidebar-title').evaluate((el) => ({
      scroll: el.scrollWidth,
      client: el.clientWidth,
    }));
    // The title wraps like the product's own, so the header never cuts a word off at its
    // edge however narrow the sidebar gets.
    expect(
      fit.scroll,
      `"Select an Object" is cut off at ${viewport.width}x${viewport.height}`,
    ).toBeLessThanOrEqual(fit.client);
  }
});

test('a grass texture that fails to load is retried once, then the flat colour stays', async ({ page }) => {
  const requests: string[] = [];
  await page.route('**/demos/space-builder/grass/color.webp*', (route) => {
    requests.push(route.request().url());
    void route.abort('failed');
  });
  const app = await openDemo(page);
  await expect(app).toHaveAttribute('data-ready', 'true');
  await expect.poll(() => requests.length, { timeout: 20_000 }).toBe(2);
  expect(requests[1]).toContain('?retry');
  // The scene keeps running on its built-in ground colour rather than failing over.
  await expect(app.locator('.boot-cover')).toHaveCount(0);
  await expect(app.locator('canvas[data-scene-canvas]')).toBeVisible();
});

test('a lost WebGL context shows the sheet fallback until the context is back', async ({ page }) => {
  const app = await openDemo(page);
  const canvas = app.locator('canvas[data-scene-canvas]');
  const cover = app.locator('.boot-cover.error');

  const lost = await canvas.evaluate((el) => {
    const gl = (el as HTMLCanvasElement).getContext('webgl2') ?? (el as HTMLCanvasElement).getContext('webgl');
    const ext = gl?.getExtension('WEBGL_lose_context');
    if (!ext) return false;
    ext.loseContext();
    setTimeout(() => ext.restoreContext(), 800);
    return true;
  });
  if (!lost) test.skip(true, 'WEBGL_lose_context unavailable');

  await expect(cover).toBeVisible();
  await expect(cover).toContainText('3D scene unavailable');
  await expect(cover).toBeHidden({ timeout: 10_000 });
});

type Drop = { x: number; y: number; width: number; height: number };
type Box = { x: number; y: number; width: number; height: number };

/**
 * Record where the walkthrough cursor sits, canvas-relative, each time a placement lands.
 * The attribute flip is read as it happens, before the orbit that follows a drop carries the
 * cursor on. Removing an object selects it too, so only a flip that follows a carried object
 * counts as a drop. No production hooks: the app already reports its phase and selection.
 */
async function watchDrops(app: Locator) {
  await app.evaluate((root) => {
    const store = window as typeof window & { __drops?: Drop[] };
    const drops: Drop[] = [];
    store.__drops = drops;
    let carrying = false;
    new MutationObserver(() => {
      const phase = root.getAttribute('data-phase');
      if (phase === 'dragging' || phase === 'armed') carrying = true;
      if (!carrying || root.getAttribute('data-selected') !== 'true') return;
      carrying = false;
      const canvas = root.querySelector('canvas[data-scene-canvas]')?.getBoundingClientRect();
      const cursor = root.querySelector('[data-demo-cursor]')?.getBoundingClientRect();
      if (!canvas || !cursor) return;
      drops.push({
        x: cursor.left + cursor.width / 2 - canvas.left,
        y: cursor.top + cursor.height / 2 - canvas.top,
        width: canvas.width,
        height: canvas.height,
      });
    }).observe(root, { attributes: true, attributeFilter: ['data-phase', 'data-selected'] });
  });
}

function dropCount(app: Locator) {
  return app.evaluate(() => (window as typeof window & { __drops?: Drop[] }).__drops?.length ?? 0);
}

/** Resolves with the next placement the walkthrough lands after `seen` of them. */
async function dropAfter(app: Locator, seen: number): Promise<Drop> {
  await expect.poll(() => dropCount(app), { timeout: 30_000, intervals: [40] }).toBeGreaterThan(seen);
  return app.evaluate(
    (_root, index) => (window as typeof window & { __drops: Drop[] }).__drops[index],
    seen,
  );
}

async function sceneBox(app: Locator): Promise<Box> {
  const box = await app.locator('canvas[data-scene-canvas]').boundingBox();
  if (!box) throw new Error('Scene canvas has no layout box');
  return box;
}

/** Orbit with a horizontal drag of `dx` px across the canvas (0.005 rad per px). */
async function orbitCamera(page: Page, box: Box, dx: number) {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let step = 1; step <= 8; step += 1) {
    await page.mouse.move(cx + (dx * step) / 8, cy);
    await page.waitForTimeout(30);
  }
  await page.mouse.up();
}

/** Orbit with a drag, zoom in with the wheel and pan with a shift-drag, all on the canvas. */
async function moveCamera(page: Page, box: Box) {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await orbitCamera(page, box, 160);
  await page.waitForTimeout(100);
  // Back over the canvas, whose wheel handler zooms instead of scrolling the page.
  await page.mouse.move(cx, cy);
  await page.mouse.wheel(0, -900);
  await page.waitForTimeout(100);
  await page.keyboard.down('Shift');
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let step = 1; step <= 6; step += 1) {
    await page.mouse.move(cx - step * 15, cy + step * 12);
    await page.waitForTimeout(30);
  }
  await page.mouse.up();
  await page.keyboard.up('Shift');
}

test('the walkthrough still drops on the visible floor after the camera moves', async ({ page }) => {
  const app = await openDemo(page);
  await watchDrops(app);
  const box = await sceneBox(app);
  const fresh = await dropAfter(app, 0);

  // The next placement clears the selection, so this flip puts the takeover between drops.
  // Taking over restarts the lap, so the next drop aims at the first floor point again,
  // the same one the fresh load dropped on.
  await expect(app).toHaveAttribute('data-selected', 'false');
  await orbitCamera(page, box, -160);
  const orbited = await dropAfter(app, 1);
  expect(orbited.x).toBeGreaterThan(0);
  expect(orbited.x).toBeLessThan(orbited.width);
  expect(orbited.y).toBeGreaterThan(0);
  expect(orbited.y).toBeLessThan(orbited.height);
  // The floor point moved on screen with the orbit. Drops used to be screen fractions, which
  // land on the same pixel whatever the camera does and so on some other floor spot.
  expect(Math.abs(orbited.x - fresh.x)).toBeGreaterThan(20);

  // Zooming in and panning may push the point out of view; the drop must still land in frame.
  await expect(app).toHaveAttribute('data-selected', 'false');
  const seen = await dropCount(app);
  await moveCamera(page, box);
  const moved = await dropAfter(app, seen);
  expect(moved.x).toBeGreaterThan(0);
  expect(moved.x).toBeLessThan(moved.width);
  expect(moved.y).toBeGreaterThan(0);
  expect(moved.y).toBeLessThan(moved.height);
});

test('Restart brings the camera home', async ({ page }) => {
  const app = await openDemo(page);
  await watchDrops(app);
  const box = await sceneBox(app);
  const fresh = await dropAfter(app, 0);

  await expect(app).toHaveAttribute('data-selected', 'false');
  await moveCamera(page, box);
  const seen = await dropCount(app);
  await app.getByRole('button', { name: 'Restart' }).click();

  // The first drop after Restart aims at the same floor point as the first drop after load,
  // so with the camera back home it lands on the same pixel; a kept view would put it elsewhere.
  const restarted = await dropAfter(app, seen);
  expect(Math.abs(restarted.x - fresh.x)).toBeLessThan(8);
  expect(Math.abs(restarted.y - fresh.y)).toBeLessThan(8);
});

type FloorEvent = 'place' | 'remove';

/**
 * Log what the floor gains and loses, from the app's own phase and selection. A selection
 * that follows a carried object is a placement; a selection with nothing carried is the
 * click the product's Remove starts with. A phase back to idle that places nothing is the
 * visitor taking over, and that object never landed.
 */
async function watchFloor(app: Locator) {
  await app.evaluate((root) => {
    const store = window as typeof window & { __floor?: FloorEvent[] };
    const log: FloorEvent[] = [];
    store.__floor = log;
    let carrying = false;
    let selected = root.getAttribute('data-selected') === 'true';
    new MutationObserver(() => {
      const phase = root.getAttribute('data-phase');
      const now = root.getAttribute('data-selected') === 'true';
      if (now && !selected) {
        log.push(carrying ? 'place' : 'remove');
        carrying = false;
      } else if (phase === 'dragging' || phase === 'armed') {
        carrying = true;
      } else if (phase === 'idle') {
        carrying = false;
      }
      selected = now;
    }).observe(root, { attributes: true, attributeFilter: ['data-phase', 'data-selected'] });
  });
}

function floorLog(app: Locator): Promise<FloorEvent[]> {
  return app.evaluate(
    () => [...((window as typeof window & { __floor?: FloorEvent[] }).__floor ?? [])],
  );
}

/** What the log leaves standing on the floor. */
function standing(log: FloorEvent[]) {
  return log.reduce((count, event) => count + (event === 'place' ? 1 : -1), 0);
}

test('a lap that starts after a takeover clears the floor first', async ({ page }) => {
  const app = await openDemo(page);
  await watchFloor(app);
  const box = await sceneBox(app);

  // One chair is down, and the drag that follows it has cleared the selection, so the
  // takeover lands between placements with that chair still on the floor.
  await expect
    .poll(() => floorLog(app).then(standing), { timeout: 30_000, intervals: [40] })
    .toBeGreaterThan(0);
  await expect(app).toHaveAttribute('data-selected', 'false');
  // An orbit hands the scene over the way any visitor gesture does. Restart, the one path
  // that resets the scene, is not involved, and the lap resumes on its own.
  await orbitCamera(page, box, -160);

  const before = await floorLog(app);
  const left = standing(before);
  expect(left).toBeGreaterThan(0);

  // The resumed lap removes what it found before it places anything of its own.
  await expect
    .poll(() => floorLog(app).then((log) => log.slice(before.length)), {
      timeout: 30_000,
      intervals: [40],
    })
    .toContain('place');
  const resumed = (await floorLog(app)).slice(before.length);
  const cleared = resumed.slice(0, resumed.indexOf('place'));
  expect(cleared.filter((event) => event === 'remove').length).toBeGreaterThanOrEqual(left);
});

/** How many objects the app says are on the floor, from its own `x,z` list. */
function onFloorCount(placed: string | null) {
  return (placed ?? '').split(' ').filter(Boolean).length;
}

test('Delete takes the selected object off the floor and names the key', async ({ page }) => {
  const app = await openDemo(page);
  const box = await sceneBox(app);

  await app.locator('[data-demo-target="catalog:table-round"]').dblclick();
  await expect(app).toHaveAttribute('data-phase', 'armed');
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.5);
  await expect(app).toHaveAttribute('data-selected', 'true');
  const before = onFloorCount(await app.getAttribute('data-placed'));
  expect(before).toBeGreaterThan(0);

  // The product's own shortcut: DEL on a selected object, and the demo says which key ran.
  await app.press('Delete');
  const toast = app.locator('.key-toast');
  await expect(toast).toBeVisible();
  await expect(toast.locator('kbd')).toHaveText(['Delete']);
  await expect(toast.locator('.key-toast__action')).toHaveText('Remove');

  await expect(app).toHaveAttribute('data-selected', 'false');
  expect(onFloorCount(await app.getAttribute('data-placed'))).toBe(before - 1);
});

/**
 * Every shortcut toast the app raises, read as it is added rather than polled for: one is
 * on screen for under two seconds, which a poll can step over.
 */
async function watchKeyToasts(app: Locator) {
  await app.evaluate((root) => {
    const store = window as typeof window & { __keyToasts?: string[] };
    const seen: string[] = [];
    store.__keyToasts = seen;
    new MutationObserver(() => {
      for (const toast of root.querySelectorAll('.key-toast')) {
        const keys = [...toast.querySelectorAll('kbd')]
          .map((chip) => chip.textContent?.trim() ?? '')
          .join('+');
        const entry = `${keys} ${toast.querySelector('.key-toast__action')?.textContent?.trim() ?? ''}`;
        if (seen[seen.length - 1] !== entry) seen.push(entry);
      }
    }).observe(root, { childList: true, subtree: true });
  });
}

function keyToasts(app: Locator): Promise<string[]> {
  return app.evaluate(
    () => [...((window as typeof window & { __keyToasts?: string[] }).__keyToasts ?? [])],
  );
}

test('the walkthrough shows the same key while it clears the floor', async ({ page }) => {
  test.slow();
  const app = await openDemo(page);
  await watchFloor(app);
  await watchKeyToasts(app);
  const box = await sceneBox(app);

  // One object down, then a takeover: the lap that resumes empties the floor before it
  // places anything, and that clearing is the Remove step the toast belongs to.
  await expect
    .poll(() => floorLog(app).then(standing), { timeout: 30_000, intervals: [40] })
    .toBeGreaterThan(0);
  await orbitCamera(page, box, -160);

  await expect
    .poll(() => keyToasts(app), { timeout: 30_000, intervals: [100] })
    .toContain('Delete Remove');
});

type Placement = { x: number; z: number };

/**
 * Every floor point the walkthrough puts an object on, from the app's own `data-placed`
 * list. The list holds one `x,z` per object in placement order, so whatever it gains at
 * the end is what just landed; a removal only ever shortens it.
 */
async function watchPlacements(app: Locator) {
  await app.evaluate((root) => {
    const store = window as typeof window & { __placed?: Placement[] };
    const placed: Placement[] = [];
    store.__placed = placed;
    const read = () => (root.getAttribute('data-placed') ?? '').split(' ').filter(Boolean);
    let last = read();
    new MutationObserver(() => {
      const now = read();
      for (const entry of now.slice(last.length)) {
        const [x, z] = entry.split(',').map(Number);
        placed.push({ x, z });
      }
      last = now;
    }).observe(root, { attributes: true, attributeFilter: ['data-placed'] });
  });
}

function placements(app: Locator): Promise<Placement[]> {
  return app.evaluate(
    () => [...((window as typeof window & { __placed?: Placement[] }).__placed ?? [])],
  );
}

/** Half the ground's side, in scene units, as the scene that draws it reports it. */
async function floorHalf(app: Locator) {
  const half = Number(await app.getAttribute('data-floor'));
  expect(half).toBeGreaterThan(0);
  return half;
}

function onFloor(at: Placement, half: number) {
  return Math.abs(at.x) <= half && Math.abs(at.z) <= half;
}

/** Wait for `count` placements, then hand back the whole list. */
async function placementsAfter(app: Locator, count: number) {
  await expect
    .poll(() => placements(app).then((all) => all.length), { timeout: 60_000, intervals: [100] })
    .toBeGreaterThanOrEqual(count);
  return placements(app);
}

test('two laps nobody touches put every object on the floor', async ({ page }) => {
  test.slow();
  const app = await openDemo(page);
  await watchPlacements(app);
  const half = await floorHalf(app);

  // Three objects a lap: two drags and the double-click route.
  const placed = await placementsAfter(app, 6);
  for (const at of placed) {
    expect(onFloor(at, half), `${JSON.stringify(at)} is off the floor`).toBe(true);
  }
});

test('a page scroll under the demo still lands objects on their floor points', async ({ page }) => {
  test.slow();
  const app = await openDemo(page);
  await watchPlacements(app);
  const half = await floorHalf(app);

  const aimed = (await placementsAfter(app, 3)).slice(0, 3);

  // Nudging the page never touches the demo, but it moves the canvas under a drag in flight.
  // The drop used to aim at a screen point taken before the drag, which after a scroll means
  // some other floor point — on a phone-sized canvas, one past the floor's edge.
  await page.evaluate(() => {
    const store = window as typeof window & { __nudge?: number };
    let down = true;
    store.__nudge = window.setInterval(() => {
      window.scrollBy(0, down ? 60 : -60);
      down = !down;
    }, 700);
  });

  const scrolled = (await placementsAfter(app, 6)).slice(3);
  await page.evaluate(() => {
    const store = window as typeof window & { __nudge?: number };
    if (store.__nudge) window.clearInterval(store.__nudge);
  });

  // A lap always aims at the same three floor points, in order, however the page has moved.
  for (const at of scrolled) {
    expect(onFloor(at, half), `${JSON.stringify(at)} is off the floor`).toBe(true);
    const match = aimed.some((p) => Math.abs(p.x - at.x) < 0.01 && Math.abs(p.z - at.z) < 0.01);
    expect(match, `${JSON.stringify(at)} is none of ${JSON.stringify(aimed)}`).toBe(true);
  }
});
