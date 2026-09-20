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
 * The part of the app each frame shows, as fractions of its box: the sidebar and the
 * canvas beside it, where the handoff happens. The whole app at the sheet's still size
 * would lose the cursor and the model.
 */
const CROP = { left: 0.38, top: 0.14, right: 1, bottom: 0.94 };
const WEBP_QUALITY = 0.9;

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

const card = app.locator('[data-demo-target="catalog:chair"]');
const picture = card.locator('img');
const canvas = app.locator('canvas[data-scene-canvas]');
const sidebar = app.locator('.sidebar');
const boxOf = async (locator) => {
  const box = await locator.boundingBox();
  if (!box) throw new Error('No layout box');
  return box;
};
const appBox = await boxOf(app);
const pictureBox = await boxOf(picture);
const canvasBox = await boxOf(canvas);
const sidebarBox = await boxOf(sidebar);

/** The moments, as pointer positions in the page. */
const press = { x: pictureBox.x + pictureBox.width * 0.55, y: pictureBox.y + pictureBox.height * 0.6 };
const overSidebar = { x: sidebarBox.x + sidebarBox.width * 0.18, y: press.y + 70 };
const canvasEdge = { x: canvasBox.x + canvasBox.width * 0.88, y: canvasBox.y + canvasBox.height * 0.78 };
const drop = { x: canvasBox.x + canvasBox.width * 0.78, y: canvasBox.y + canvasBox.height * 0.8 };
const clip = {
  x: appBox.x + appBox.width * CROP.left,
  y: appBox.y + appBox.height * CROP.top,
  width: appBox.width * (CROP.right - CROP.left),
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

async function showCursor(at, pressed) {
  await app.evaluate((el, { x, y, pressed }) => {
    const cursor = el.querySelector('[data-capture-cursor]');
    const rect = el.getBoundingClientRect();
    cursor.style.transform = `translate3d(${x - rect.left}px, ${y - rect.top}px, 0)`;
    cursor.classList.toggle('clicking', pressed);
  }, { x: at.x, y: at.y, pressed });
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

await browser.close();
