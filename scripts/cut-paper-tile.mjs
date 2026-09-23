#!/usr/bin/env node
/**
 * Cuts public/paper-fibre.webp out of Hugo's paper scan.
 *
 * Usage:
 *   node scripts/cut-paper-tile.mjs
 *   node scripts/cut-paper-tile.mjs --source ~/projects/cv-assets/'Paper Texture3.jpg'
 *   node scripts/cut-paper-tile.mjs --x 1520 --y 1840 --size 192 --mean 216.4
 *
 * The scan lives outside the repo (it is 5.5 MB), so this is a one-shot generator kept for
 * provenance: it records which patch of which file the shipped tile came from, and the tile
 * can be recut from a different patch without guessing at the old crop.
 */

import { statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULTS = {
  source: resolve(process.env.HOME ?? '', 'projects/cv-assets/Paper Texture3.jpg'),
  // A patch of plain sheet, and of every patch this size in the scan the one whose own
  // coarse structure is flattest: fine fibre averages out at reading distance, a blotch
  // does not, and a blotch is what lets the eye find the lattice the tile repeats on.
  x: 320,
  y: 400,
  size: 192,
  // The width of the band each edge is blended over, in pixels.
  feather: 24,
  // Where the tile's tail starts being eased in, and where it ends up, in standard
  // deviations. A scan of paper carries dust as well as fibre, and one speck eight
  // deviations down is a dark dot that the tile then repeats on its own lattice.
  knee: 3,
  limit: 4.5,
  // The level the tile is centred on. Multiply darkens a sheet by (255 - mean) / 255 of the
  // grain's opacity whatever else the tile does, so moving this moves every sheet's tone.
  mean: 216.4,
  out: resolve(ROOT, 'public/paper-fibre.webp'),
};

const args = process.argv.slice(2);
const opts = { ...DEFAULTS };
for (let i = 0; i < args.length; i += 2) {
  const key = args[i].replace(/^--/, '');
  if (!(key in opts)) throw new Error(`unknown option ${args[i]}`);
  opts[key] = typeof DEFAULTS[key] === 'number' ? Number(args[i + 1]) : args[i + 1];
}

const smoothstep = (t) => t * t * (3 - 2 * t);

/**
 * Makes the crop repeat without a seam by fading its leading edge into the patch one tile
 * further along, rather than by mirroring it: a mirrored tile is symmetric about both axes,
 * which is a pattern the eye can find on a wide sheet even when the seam is invisible.
 *
 * Blending two independent samples at weights a and 1-a leaves them with sqrt(a^2 + (1-a)^2)
 * of their own spread, so the fade would otherwise lay a quieter stripe down two edges of
 * every tile; each blended pixel is pushed back out from the pair's midpoint to undo that.
 */
const fade = (near, far, along, feather) => {
  const a = along < feather ? smoothstep(along / feather) : 1;
  if (a === 1) return near;
  const b = 1 - a;
  const mid = (near + far) / 2;
  return mid + (a * near + b * far - mid) / Math.sqrt(a * a + b * b);
};

function fadeLeftEdge(src, width, rows, size, feather) {
  const out = new Float32Array(size * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < size; x++) {
      out[y * size + x] = fade(src[y * width + x], src[y * width + x + size], x, feather);
    }
  }
  return out;
}

function fadeTopEdge(src, size, feather) {
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      out[y * size + x] = fade(src[y * size + x], src[(y + size) * size + x], y, feather);
    }
  }
  return out;
}

const { size, feather } = opts;
const { data, info } = await sharp(opts.source)
  .extract({ left: opts.x, top: opts.y, width: size * 2, height: size * 2 })
  .greyscale()
  .raw()
  .toBuffer({ resolveWithObject: true });

// The grain is a luminance modulation and the sheet's hue is the theme's, so one channel
// carries everything the page uses and costs a third of what three would to store losslessly.
const tile = fadeTopEdge(fadeLeftEdge(data, info.width, info.height, size, feather), size, feather);

let sum = 0;
let square = 0;
for (const v of tile) {
  sum += v;
  square += v * v;
}
const mean = sum / tile.length;
const sd = Math.sqrt(square / tile.length - mean * mean);

const { knee, limit } = opts;
const ease = (z) => {
  const past = Math.abs(z) - knee;
  if (past <= 0) return z;
  return Math.sign(z) * (knee + (limit - knee) * Math.tanh(past / (limit - knee)));
};

const pixels = Buffer.alloc(size * size);
for (let i = 0; i < tile.length; i++) {
  const level = opts.mean + sd * ease((tile[i] - mean) / sd);
  pixels[i] = Math.max(0, Math.min(255, Math.round(level)));
}

// Lossless, because the tile is nothing but high-frequency noise and that is the worst thing
// a block-transform codec can be handed: it spends its bits smoothing the fibre and answers
// with a visible transform grid, which a multiply blend over near-white paper shows off.
const encoded = await sharp(pixels, { raw: { width: size, height: size, channels: 1 } })
  .webp({ lossless: true, effort: 6 })
  .toBuffer();
writeFileSync(opts.out, encoded);

let spread = 0;
for (let i = 0; i < tile.length; i++) spread += (pixels[i] - opts.mean) ** 2;
console.log(
  `${opts.out}: ${size}x${size} lossless webp, ${statSync(opts.out).size} bytes, ` +
    `mean ${opts.mean}, sd ${Math.sqrt(spread / tile.length).toFixed(2)}, ` +
    `cut from ${opts.source} at (${opts.x}, ${opts.y})`,
);
