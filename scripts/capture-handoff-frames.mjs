/**
 * Capture the drag and drop demo's handoff frames, the four stills the "Picture to Model"
 * sheet shows: the press on a card, the picture riding the pointer over the sidebar, the
 * model on the pointer just inside the canvas, and the placed chair with its highlight.
 *
 * The frames come from the demo itself. Playwright drives the app's own pointer drag
 * (DragDropSceneApp.vue onItemPointerdown, updateDragVisual, endItemDrag) against a
 * built preview of this checkout, and the app is screenshotted at 3x after each moment,
 * cropped to the sidebar and the canvas beside it. The app draws its cursor only while its walkthrough runs, so the same cursor
 * markup is put at the pointer for the shot, from the app's own styles; nothing else is
 * drawn over the frames. Chrome runs with reduced motion so the walkthrough never starts
 * and the floor is empty when the drag begins.
 *
 * Usage: npm run build && ASTRO_PREVIEW_BACKGROUND=1 npm run preview -- --port 4369
 *        node scripts/capture-handoff-frames.mjs [http://localhost:4369] [out-dir]
 *
 * Writes handoff-1.webp to handoff-4.webp to public/demos/drag-drop/ unless out-dir says
 * otherwise. Needs a system Chrome on PATH, as the e2e suite does (playwright.config.ts).
 */
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = process.argv[2] ?? 'http://localhost:4369';
const outDir = path.resolve(root, process.argv[3] ?? 'public/demos/drag-drop');

/** The app's size on the stack's front page at this viewport. */
const VIEWPORT = { width: 1440, height: 900 };
const SCALE = 3;
/**
 * The part of the app each frame shows, as fractions of its box: the end of the canvas and
 * the one catalog card beside it, where the handoff happens. The whole app at the sheet's
 * still size would lose the cursor and the model. The right edge is no fraction but the
 * sidebar's own, measured below, so nothing in the sidebar is cut at the frame's border.
 * Top and bottom keep nearly the whole height, and that is what lets four frames across a
 * sheet still be tall enough to read.
 */
const CROP = { left: 0.535, top: 0, bottom: 1 };
/**
 * The sidebar, narrowed to the single column the hidden cards leave behind. At its full
 * width the frame could either cut the header's title in half or spend a third of itself
 * on the empty column, and the card would keep the width the two-column grid gives it
 * either way. Narrowed, the whole sidebar fits the frame and the title wraps to two
 * lines, as the product's own sidebar title does when its panel is this narrow.
 */
const SIDEBAR_WIDTH_PX = 144;
/**
 * The camera comes in on the drop before the drag starts, so the chair that lands on the
 * floor is about twice as tall in the frame. `applyWheelZoom` turns a wheel notch into a
 * radius factor of `exp(deltaY * 0.0012)`, and a third is as far in as the scene goes:
 * `setOrbitRadius` clamps the radius at 6 scene units, which from the opening 18 leaves
 * the placed chair 1.8x as tall. Only the capture zooms. The demo keeps the framing the
 * product opens with, since it has a whole floor to show and not one drop.
 */
const ZOOM_WHEEL_DELTA = Math.log(1 / 3) / 0.0012;
const WEBP_QUALITY = 0.9;

/** The hot spot of the cursor below, the path's tip, as a point of its 32-unit viewBox. */
const HOT_SPOT = { x: 4, y: 2.5 };
/** How far the drawn hot spot may sit from the pointer, in CSS pixels. */
const HOT_SPOT_SLACK = 0.5;

/** The app's cursor, as DragDropSceneApp.vue draws it; its hot spot is the path's top-left. */
const CURSOR_SVG =
  '<svg viewBox="0 0 32 32" width="40" height="40"><path d="M4 2.5v24.2l6.4-6.2 4.1 9.7 4.2-1.8-4.1-9.6H26z" fill="#fff" stroke="#222" stroke-width="1.6" stroke-linejoin="round"/></svg>';

function systemChrome() {
  for (const name of ['google-chrome-stable', 'google-chrome', 'chromium']) {
    try {
      return execFileSync('which', [name], { encoding: 'utf8' }).trim();
    } catch {
      continue;
    }
  }
  throw new Error('No system Chrome on PATH');
}

const browser = await chromium.launch({
  executablePath: systemChrome(),
  args: ['--use-angle=swiftshader'],
});
const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SCALE });
await context.addInitScript(() => localStorage.setItem('cv-theme', 'dark-forest'));
const page = await context.newPage();
await page.emulateMedia({ reducedMotion: 'reduce' });
await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });

const stack = page.locator('article.technical-drawing-stack').nth(4);
await stack.scrollIntoViewIfNeeded();
const app = stack.locator('.drag-drop-scene-app');
await app.waitFor();
await page.waitForFunction(
  (el) => el.getAttribute('data-ready') === 'true',
  await app.elementHandle(),
  { timeout: 60_000 },
);
// The scene's first frames settle after the ready mark.
await page.waitForTimeout(1500);
// The sheet's title block lies over the island's corner; the frames show the app alone.
await stack.locator('table[aria-label$="title block"]').evaluateAll((tables) => {
  for (const table of tables) table.style.visibility = 'hidden';
});
// The Restart button sits in the canvas corner the wider crop reaches, and the drag is the
// only thing these frames are about.
await app.locator('.controls').evaluateAll((controls) => {
  for (const el of controls) el.style.visibility = 'hidden';
});

const card = app.locator('[data-demo-target="catalog:chair"]');
// Only the card that is dragged, so each frame can give the floor the width the rest of
// the catalog was taking. Done here rather than in the app: the page a visitor gets keeps
// its whole catalog, and nothing about these four stills belongs in it.
await app.evaluate((el, width) => {
  const hide = (node) => node?.style.setProperty('display', 'none');
  for (const other of el.querySelectorAll('[data-catalog-item]')) {
    if (other.getAttribute('data-catalog-item') !== 'chair') hide(other);
  }
  hide(el.querySelector('.catalog-search'));
  // One card, one column, and a sidebar no wider than it needs to hold that column.
  el.style.gridTemplateColumns = `minmax(0, 1fr) ${width}px`;
  el.querySelector('.catalog-grid')?.style.setProperty('grid-template-columns', 'minmax(0, 1fr)');
}, SIDEBAR_WIDTH_PX);
const canvas = app.locator('canvas[data-scene-canvas]');
const sidebar = app.locator('.sidebar');
const boxOf = async (locator) => {
  const box = await locator.boundingBox();
  if (!box) throw new Error('No layout box');
  return box;
};
const appBox = await boxOf(app);
const cardBox = await boxOf(card);
const canvasBox = await boxOf(canvas);
const sidebarBox = await boxOf(sidebar);

/** The moments, as pointer positions in the page. The card box is the picture's tile. */
const press = { x: cardBox.x + cardBox.width * 0.5, y: cardBox.y + cardBox.height * 0.5 };
// A tile's height below the press, which puts the carried picture just under the card it
// came from: with one card in the catalog, a ghost over the card would show the same chair
// twice in one frame, and the sidebar has no room to clear the card by more than this.
const overSidebar = { x: cardBox.x + cardBox.width * 0.45, y: press.y + cardBox.height + 4 };
const canvasEdge = { x: canvasBox.x + canvasBox.width * 0.88, y: canvasBox.y + canvasBox.height * 0.78 };
const drop = { x: canvasBox.x + canvasBox.width * 0.78, y: canvasBox.y + canvasBox.height * 0.8 };
const clipLeft = appBox.x + appBox.width * CROP.left;
const clip = {
  x: clipLeft,
  y: appBox.y + appBox.height * CROP.top,
  width: sidebarBox.x + sidebarBox.width - clipLeft,
  height: appBox.height * (CROP.bottom - CROP.top),
};

async function moveTo(to, from, steps = 12) {
  for (let step = 1; step <= steps; step += 1) {
    await page.mouse.move(from.x + ((to.x - from.x) * step) / steps, from.y + ((to.y - from.y) * step) / steps);
    await page.waitForTimeout(16);
  }
}

await app.evaluate((el, svg) => {
  const scoped = [...el.attributes].map((a) => a.name).find((name) => name.startsWith('data-v-'));
  const cursor = document.createElement('div');
  cursor.className = 'demo-cursor instant';
  cursor.dataset.captureCursor = '';
  if (scoped) cursor.setAttribute(scoped, '');
  cursor.setAttribute('aria-hidden', 'true');
  cursor.innerHTML = svg;
  el.appendChild(cursor);
}, CURSOR_SVG);

/**
 * Put the cursor at a pointer point of the page, the way the app places its own: with
 * `translate`, which the press shrink (`scale`) leaves alone, and offset by the hot spot.
 * A `transform` here would be multiplied by that shrink and slide towards the app's corner.
 * The drawn hot spot is then measured against the pointer, through the path's own screen
 * matrix, so a frame is never shot with the cursor beside the thing it acts on.
 */
async function showCursor(at, pressed) {
  const off = await app.evaluate((el, { x, y, pressed, hotSpot }) => {
    const cursor = el.querySelector('[data-capture-cursor]');
    const rect = el.getBoundingClientRect();
    cursor.style.translate = `calc(${x - rect.left}px - 12%) calc(${y - rect.top}px - 8%)`;
    cursor.classList.toggle('clicking', pressed);
    const path = cursor.querySelector('path');
    const ctm = path.getScreenCTM();
    const drawn = new DOMPoint(hotSpot.x, hotSpot.y).matrixTransform(ctm);
    return { x: drawn.x - x, y: drawn.y - y };
  }, { x: at.x, y: at.y, pressed, hotSpot: HOT_SPOT });
  if (Math.abs(off.x) > HOT_SPOT_SLACK || Math.abs(off.y) > HOT_SPOT_SLACK) {
    throw new Error(`Cursor hot spot ${off.x.toFixed(2)}, ${off.y.toFixed(2)} px off the pointer`);
  }
}

async function capture(index) {
  await page.waitForTimeout(800);
  const png = await page.screenshot({ clip, animations: 'disabled' });
  const dataUrl = await page.evaluate(async ({ png, quality }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext('2d').drawImage(image, 0, 0);
    return canvas.toDataURL('image/webp', quality);
  }, { png: png.toString('base64'), quality: WEBP_QUALITY });
  const file = path.join(outDir, `handoff-${index}.webp`);
  await writeFile(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log(file);
}

await mkdir(outDir, { recursive: true });

// The frames are about one chair, so the camera comes in on it; the app's own wheel
// handler does the zoom, the same way a visitor would.
await page.mouse.move(canvasBox.x + canvasBox.width * 0.5, canvasBox.y + canvasBox.height * 0.5);
await page.mouse.wheel(0, ZOOM_WHEEL_DELTA);
await page.waitForTimeout(600);

// 1. The press on the card: the drag is armed, nothing moves yet.
await page.mouse.move(press.x, press.y);
await page.mouse.down();
await showCursor(press, true);
await capture(1);

// 2. Over the sidebar: the card's picture rides the pointer, grabbed where the press landed.
await moveTo(overSidebar, press);
await showCursor(overSidebar, true);
await capture(2);

// 3. Just inside the canvas: the picture is gone and the model sits under the pointer.
await moveTo(canvasEdge, overSidebar);
await showCursor(canvasEdge, true);
await capture(3);

// 4. Released: one chair placed and selected.
await moveTo(drop, canvasEdge);
await page.mouse.up();
await showCursor(drop, false);
await capture(4);

// What HandoffLayer.astro lays the frames out from: the shot's own shape, and the canvas's
// share of it, which is where everything the captions point at happens.
console.log(`frame ${Math.round(clip.width * SCALE)}x${Math.round(clip.height * SCALE)}`);
console.log(`aspect ${(clip.width / clip.height).toFixed(3)}`);
console.log(`canvas fraction ${((sidebarBox.x - clip.x) / clip.width).toFixed(3)}`);

await browser.close();
