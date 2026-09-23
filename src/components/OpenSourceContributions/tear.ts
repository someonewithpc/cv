/**
 * The torn edges of the contributions paper, drawn once at build time.
 *
 * A tear is a line of fibre pulled apart, so its edge wanders at every scale: a slow drift
 * across the sheet, a ripple every few tens of pixels and a fine roughness every two or three.
 * Each scale here is a band of sine waves with whole-number frequencies over the tile, which
 * makes the tile repeat without a seam, so a sheet of any width lays copies of it side by side
 * and the detail stays the same size however wide the sheet is.
 *
 * Each edge comes as two images of the same tile. The mask keeps the paper on one side of the
 * edge and lets a few loose fibres stand out past it. The fringe is the thin pale band along the
 * edge where the fibres pulled out; the sheet paints it in its own colour through that image.
 */

const TILE = 640;
const STEP = 1.6;
/* Every coordinate is written in fifths of a pixel, so the path carries whole numbers. */
const UNIT = 5;

type Edge = { mask: string; fringe: string };

const random = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** One band of sine waves between two frequencies, scaled to the spread asked for. */
const band = (next: () => number, samples: number, from: number, to: number, spread: number) => {
  const waves = Array.from({ length: to - from + 1 }, (_, index) => ({
    k: from + index,
    phase: next() * Math.PI * 2,
    weight: (0.5 + next()) / Math.sqrt(from + index),
  }));
  const values = Array.from({ length: samples }, (_, i) =>
    waves.reduce((sum, { k, phase, weight }) => sum + weight * Math.sin((2 * Math.PI * k * i) / samples + phase), 0));
  const deviation = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / samples);
  return values.map((value) => (value / deviation) * spread);
};

const encode = (svg: string) => `url("data:image/svg+xml,${svg.replaceAll('<', '%3C').replaceAll('>', '%3E').replaceAll('#', '%23').replaceAll('"', "'")}")`;

/** A run of points as one relative path, each step one sample along. */
const run = (points: number[], dx = STEP * UNIT) => {
  let out = '';
  for (let i = 1; i < points.length; i++) {
    const dy = points[i] - points[i - 1];
    out += `l${dx}${dy < 0 ? '' : ','}${dy}`;
  }
  return out;
};

/**
 * @param seed  which tear; two seeds never tear alike
 * @param depth the height of the tile in pixels; the paper side is the bottom for a top edge
 * @param side  'top' keeps the paper under the edge, 'bottom' keeps it above
 */
export function tear(seed: number, depth: number, side: 'top' | 'bottom'): Edge {
  const next = random(seed);
  const samples = TILE / STEP;

  const drift = band(next, samples, 1, 5, 2.6);
  const ripple = band(next, samples, 8, 48, 1.1);
  const rough = band(next, samples, 60, 180, 0.55);
  const grit = Array.from({ length: samples }, () => (next() - 0.5) * 0.7);
  const middle = depth / 2;
  const edge = drift.map((_, i) => {
    const y = middle + drift[i] + ripple[i] + rough[i] + grit[i];
    return Math.min(depth - 2, Math.max(2, y));
  });
  /* The pale band runs one to three pixels in from the edge, rough on its own inner side. */
  const inner = band(next, samples, 20, 120, 0.45).map((wobble, i) => edge[i] + 1.7 + wobble + (next() - 0.5) * 0.6);

  const flip = (y: number) => (side === 'top' ? y : depth - y);
  const units = (values: number[]) => values.map((y) => Math.round(flip(y) * UNIT));
  const outline = units([...edge, edge[0]]);
  const inside = units([...inner, inner[0]]);

  const w = TILE * UNIT;
  const h = depth * UNIT;
  const paperSide = side === 'top' ? h : 0;

  /* Loose fibres: a hair here and there, rooted in the paper and standing out past the edge. */
  const fibres: string[] = [];
  const hairs = Math.round(TILE / 9);
  for (let n = 0; n < hairs; n++) {
    const i = Math.floor(next() * samples);
    const x = i * STEP * UNIT;
    const root = outline[i] + (side === 'top' ? 1 : -1) * Math.round((0.6 + next()) * UNIT);
    const length = (1.2 + next() * next() * 3.2) * UNIT;
    const lean = (next() - 0.5) * 1.6;
    const tipX = Math.round(x + Math.sin(lean) * length);
    const tipY = Math.round(root + (side === 'top' ? -1 : 1) * Math.cos(lean) * length);
    fibres.push(`M${x},${root}L${tipX},${tipY}`);
  }
  const hair = `<path d='${fibres.join('')}' stroke='#000' stroke-width='${0.45 * UNIT}' stroke-linecap='round' stroke-opacity='.55' fill='none'/>`;

  const open = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}' preserveAspectRatio='none'>`;
  const paper = `<path d='M0,${paperSide}L0,${outline[0]}${run(outline)}L${w},${paperSide}Z'/>`;
  const reversed = [...inside].reverse();
  const fringe = `<path d='M0,${outline[0]}${run(outline)}L${w},${reversed[0]}${run(reversed, -STEP * UNIT)}Z' fill-opacity='.75'/>`;

  return {
    mask: encode(`${open}${paper}${hair}</svg>`),
    fringe: encode(`${open}${fringe}${hair}</svg>`),
  };
}

/** The tile's width, which the sheet repeats its edges at. */
export const TEAR_TILE = `${TILE / 16}rem`;
