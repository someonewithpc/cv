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

test('autoplay runs and hands over to the visitor', async ({ page }) => {
  const app = await openDemo(page);
  const playing = app.locator('.demo-flash');
  await expect(playing).toBeVisible({ timeout: 25_000 });

  await app.locator('[data-demo-target="catalog:chair"]').click();
  await expect(playing).toBeHidden();
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
  // The callouts' placement is annotations-position.spec.ts's; here only that they exist.
  await expect(layer.locator('svg[data-annotations] [data-target]')).toHaveCount(4);

  const words = await front.evaluate((page) => {
    const text = [
      page.querySelector<HTMLElement>('[data-handoff-layer]')?.innerText ?? '',
      page.querySelector<HTMLElement>('.aside')?.innerText ?? '',
    ].join(' ');
    return text.split(/\s+/).filter((word) => /\w/.test(word)).length;
  });
  expect(words).toBeLessThan(50);
});

/** What the four callouts say, in the order the frames run. */
const HANDOFF_CALLOUTS = [
  'drag the object to the viewport',
  'over the catalog it is still a picture',
  'over the floor it becomes the model',
  'let go and it is placed',
];

/** A phone held upright, the size the callouts had the least room on. */
const PORTRAIT_PHONE = { width: 390, height: 844 };

for (const phone of [false, true]) {
  test(`the handoff callouts read in frame order, each on its own frame's canvas${phone ? ', on a phone' : ''}`, async ({ page }) => {
    if (phone) {
      await page.setViewportSize(PORTRAIT_PHONE);
      await page.goto('/');
    }
    const stack = dragDropStack(page);
    await stack.scrollIntoViewIfNeeded();
    await swipeToPage(page, stack, 'Picture to Model', 2);
    const layer = frontPage(stack, await frontPageIndex(stack)).locator('[data-handoff-layer]');
    await expect(layer).toBeVisible();

    const callouts = await layer.evaluate((root) => {
      const box = (el: Element) => {
        const { left, top, right, bottom } = el.getBoundingClientRect();
        return { left, top, right, bottom };
      };
      const svg = root.querySelector('svg[data-annotations]')!;
      // How much of a frame's width the captured canvas takes, from the crop the capture
      // script prints, so this reads the same fraction the frames were made with.
      const canvas = Number(root.querySelector<HTMLElement>('[data-handoff-strip]')!.dataset.canvasFraction);
      return [...svg.querySelectorAll<SVGGElement>('[data-target]')].map((callout) => {
        const mark = root.querySelector(callout.dataset.target!)!;
        const frame = box(mark.closest('figure')!);
        return {
          // The label wraps into one tspan a row, so its words only read back with the rows spaced.
          text: [...callout.querySelectorAll('tspan')].map((row) => row.textContent?.trim()).join(' '),
          label: box(callout.querySelector('text')!),
          frame,
          canvasRight: frame.left + (frame.right - frame.left) * canvas,
          sheet: box(svg.closest('section')!),
        };
      });
    });

    expect(callouts.map((callout) => callout.text)).toEqual(HANDOFF_CALLOUTS);

    // A label belongs on the frame it names, and on the canvas half of it: the catalog side
    // is cards and their titles, and a line laid over those reads as neither. Staying on one
    // frame also keeps it on the sheet and clear of the other three, since no two overlap.
    const SLACK = 1;
    for (const { text, label, frame, canvasRight, sheet } of callouts) {
      expect(label.left, `"${text}" past its frame's left edge`).toBeGreaterThanOrEqual(frame.left - SLACK);
      expect(label.right, `"${text}" over its frame's catalog`).toBeLessThanOrEqual(canvasRight + SLACK);
      expect(label.top, `"${text}" above its frame`).toBeGreaterThanOrEqual(frame.top - SLACK);
      expect(label.bottom, `"${text}" below its frame`).toBeLessThanOrEqual(frame.bottom + SLACK);
      expect(label.left >= sheet.left && label.right <= sheet.right, `"${text}" off the sheet`).toBe(true);
    }
    for (const a of callouts) {
      for (const b of callouts) {
        if (a === b) continue;
        const overlap =
          a.label.left < b.label.right && b.label.left < a.label.right &&
          a.label.top < b.label.bottom && b.label.top < a.label.bottom;
        expect(overlap, `"${a.text}" and "${b.text}" overlap`).toBe(false);
      }
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
    return {
      sheet: box(sheet),
      panel: box(root.querySelector('.panel')!),
      // The title block is the sheet's own corner table, the note its third column.
      titleBlock: box(sheet.querySelector(':scope > table')!),
      aside: box(sheet.querySelector(':scope > .aside')!),
    };
  });

  // A landscape sheet gives the artwork two of its three columns and keeps the third for
  // the note and the title block, which the panel once covered by growing to the strip's
  // own width instead of the column's.
  expect(boxes.panel.right).toBeLessThanOrEqual(boxes.titleBlock.left);
  expect(boxes.panel.right).toBeLessThanOrEqual(boxes.aside.left);
  // And it still fills that column, rather than having been fixed by shrinking to nothing:
  // two thirds of the sheet, less the mat, is 0.64 of it.
  const sheetWidth = boxes.sheet.right - boxes.sheet.left;
  expect(boxes.panel.right - boxes.panel.left).toBeGreaterThan(0.6 * sheetWidth);
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
