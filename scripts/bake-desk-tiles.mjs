#!/usr/bin/env node
/**
 * Bakes src/assets/desk/<theme>.webp: each theme's veneer scan with its desk colour, blend and
 * veil already applied, so the page lays the tile down as it is and can paint the tile's own
 * average under it while it loads. Also bakes src/assets/desk/<theme>-720.webp, the same pixels
 * downsized: under 52rem the desk is only a strip down each edge and a band between sections
 * (Layout.astro), a few pixels wide, so a quarter of the linear resolution is all that shows.
 *
 * Usage:
 *   node scripts/bake-desk-tiles.mjs
 *   node scripts/bake-desk-tiles.mjs --quality 85
 *
 * The recipes are the CSS the desk ran before it was baked: background-color `base`, the scan
 * blended onto it with `blend`, then a flat veil of `desk` faded by `grain` blended on top with
 * `veilBlend`. Each is a per-pixel function of the scan, so baking at the scan's own size and
 * letting the browser scale the result gives the same pixels the browser drew before. The
 * script prints each tile's average, which is the --theme-desk-average ThemePicker.astro sets.
 */

import { statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = resolve(ROOT, 'src/assets/desk');
const VENEER = resolve(DESK, 'veneer');
const PHONE_SIZE = 720;

/*
 * Overlay scales every step the scan has by base * (1 - base), which collapses near black, so
 * the dark desks subtract their scan from a base instead: the scan's own mean less 28 of 255,
 * then an opaque veil blended with color hands back the desk's hue and chroma while the
 * subtraction keeps the grain at full size.
 */
const RECIPES = {
  // The same oak as the other three, raised to the ash boards' tone and limed.
  light: { wood: 'oak-7760-limed', desk: [0.76, 0.05, 68], grain: 0.85, blend: 'overlay', veilBlend: 'normal' },
  // Slip-matched oak, levelled: cathedral figure across the page and no joint in it.
  dark: { wood: 'oak-7760-mid', desk: [0.235, 0.01, 55], grain: 0, base: [128, 97, 73], blend: 'difference', veilBlend: 'color' },
  // The same oak at its own lightness, which under a pale desk reads as bleached.
  arctic: { wood: 'oak-7760', desk: [0.81, 0.013, 232], grain: 0.85, blend: 'overlay', veilBlend: 'normal' },
  // The same oak smoked in the file: darker, and drained of red before the veil goes on.
  'dark-forest': { wood: 'oak-7760-smoked', desk: [0.225, 0.03, 75], grain: 0, base: [76, 68, 62], blend: 'difference', veilBlend: 'color' },
};

const args = process.argv.slice(2);
const opts = { quality: 90 };
for (let i = 0; i < args.length; i += 2) {
  const key = args[i].replace(/^--/, '');
  if (!(key in opts)) throw new Error(`unknown option ${args[i]}`);
  opts[key] = Number(args[i + 1]);
}

const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

const oklchToSrgb = ([l, c, h]) => {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ].map((v) => Math.min(1, Math.max(0, toGamma(v))));
};

const lum = ([r, g, b]) => 0.3 * r + 0.59 * g + 0.11 * b;

const clipColor = (c) => {
  const l = lum(c);
  const n = Math.min(...c);
  const x = Math.max(...c);
  let out = c;
  if (n < 0) out = out.map((v) => l + ((v - l) * l) / (l - n));
  if (x > 1) out = out.map((v) => l + ((v - l) * (1 - l)) / (x - l));
  return out;
};

const setLum = (c, l) => {
  const d = l - lum(c);
  return clipColor(c.map((v) => v + d));
};

const BLENDS = {
  normal: (_cb, cs) => cs,
  overlay: (cb, cs) => cb.map((b, i) => (b <= 0.5 ? 2 * b * cs[i] : 1 - 2 * (1 - b) * (1 - cs[i]))),
  difference: (cb, cs) => cb.map((b, i) => Math.abs(b - cs[i])),
  color: (cb, cs) => setLum(cs, lum(cb)),
};

const composite = (cb, cs, alpha, mode) => {
  const blended = BLENDS[mode](cb, cs);
  return cb.map((b, i) => alpha * blended[i] + (1 - alpha) * b);
};

const hex = (rgb) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');

for (const [theme, recipe] of Object.entries(RECIPES)) {
  const { data, info } = await sharp(resolve(VENEER, `${recipe.wood}.webp`))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const desk = oklchToSrgb(recipe.desk);
  const base = recipe.base ? recipe.base.map((v) => v / 255) : desk;
  const veilAlpha = 1 - recipe.grain;
  const out = Buffer.alloc(data.length);
  const sums = [0, 0, 0];

  for (let p = 0; p < data.length; p += 3) {
    const tile = [data[p] / 255, data[p + 1] / 255, data[p + 2] / 255];
    const wood = composite(base, tile, 1, recipe.blend).map((v) => Math.round(v * 255) / 255);
    const veiled = composite(wood, desk, veilAlpha, recipe.veilBlend);
    for (let i = 0; i < 3; i++) {
      const v = Math.round(Math.min(1, Math.max(0, veiled[i])) * 255);
      out[p + i] = v;
      sums[i] += v;
    }
  }

  const path = resolve(DESK, `${theme}.webp`);
  await sharp(out, { raw: info })
    .webp({ quality: opts.quality, smartSubsample: true, effort: 6 })
    .toFile(path);

  const phonePath = resolve(DESK, `${theme}-${PHONE_SIZE}.webp`);
  await sharp(out, { raw: info })
    .resize(PHONE_SIZE, PHONE_SIZE)
    .webp({ quality: opts.quality, smartSubsample: true, effort: 6 })
    .toFile(phonePath);

  const pixels = data.length / 3;
  const average = sums.map((s) => Math.round(s / pixels));
  const encoded = (await sharp(path).stats()).channels.slice(0, 3).map((c) => Math.round(c.mean));
  console.log(
    `${theme}: ${info.width}x${info.height} q${opts.quality}, ${statSync(path).size} bytes, ` +
      `average rgb(${encoded.join(' ')}) ${hex(encoded)} (before encoding rgb(${average.join(' ')})); ` +
      `${PHONE_SIZE}x${PHONE_SIZE} ${statSync(phonePath).size} bytes`,
  );
}
