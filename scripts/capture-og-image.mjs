/**
 * Capture public/og.jpg, the picture chat apps and social sites show for a link to the site:
 * the page's own title block on its paper over the desk, in the Light theme.
 *
 * The page is shot at 1200x630 CSS pixels and 2x, then scaled down to 1200x630, the size
 * Open Graph cards ask for. Everything but the title block is hidden for the shot, and the
 * block is moved to the middle of the frame. None of that reaches the page a visitor gets.
 * The file is a baseline JPEG, since some link card readers reject progressive ones.
 *
 * Usage: npm run build && ASTRO_PREVIEW_BACKGROUND=1 npm run preview -- --port 4369
 *        npm run og:image [-- http://localhost:4369] [out-file]
 *
 * Re-run it in any PR that changes what the frame shows: the title block, the desk surface,
 * or anything else drawn inside the 1200x630 shot. The desk ornaments of #324 are one such
 * change, so that PR regenerates the file when it lands. A merge that leaves the frame alone
 * does not need a new image. Needs a system Chrome on PATH, as the e2e suite does
 * (playwright.config.ts).
 */
import { execFileSync } from 'node:child_process';
import { stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = process.argv[2] ?? 'http://localhost:4369';
const outFile = path.resolve(root, process.argv[3] ?? 'public/og.jpg');

const SIZE = { width: 1200, height: 630 };
const SCALE = 2;
/** OG_QUALITY overrides it to compare sizes. */
const QUALITY = Number(process.env.OG_QUALITY ?? 80);
/** WhatsApp drops a preview image past about 300 KB. */
const MAX_BYTES = 300 * 1024;

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

const browser = await chromium.launch({ executablePath: systemChrome() });
try {
  const context = await browser.newContext({ viewport: SIZE, deviceScaleFactor: SCALE });
  await context.addInitScript(() => localStorage.setItem('cv-theme', 'light'));
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);

  const block = page.locator('#profile .title-block');
  await page.addStyleTag({
    content: `
      body > :not(main), main > :not(#profile) { visibility: hidden; }
      #profile .note-row, #profile audio { display: none; }
    `,
  });
  const box = await block.boundingBox();
  if (!box) throw new Error('No title block on the page');
  await block.evaluate((el, dy) => {
    el.style.translate = `0 ${dy}px`;
  }, (SIZE.height - box.height) / 2 - box.y);
  await page.waitForTimeout(300);

  const shot = await page.screenshot({ animations: 'disabled' });
  const jpeg = await sharp(shot)
    .resize(SIZE.width, SIZE.height, { kernel: 'lanczos3' })
    .flatten({ background: '#ffffff' })
    // sharp's mozjpeg preset without its progressive scans
    .jpeg({
      quality: QUALITY,
      progressive: false,
      optimiseCoding: true,
      trellisQuantisation: true,
      overshootDeringing: true,
      quantisationTable: 3,
    })
    .toBuffer();
  await writeFile(outFile, jpeg);
  const { size } = await stat(outFile);
  console.log(`${outFile} ${SIZE.width}x${SIZE.height} ${(size / 1024).toFixed(1)} KB`);
  if (size > MAX_BYTES) throw new Error(`og image is ${size} bytes, over ${MAX_BYTES}`);
} finally {
  await browser.close();
}
