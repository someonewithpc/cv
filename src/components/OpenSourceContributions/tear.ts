/**
 * The torn edges of the contributions paper, drawn once at build time.
 *
 * Paper does not tear straight through. The fibres pull apart in the plane of the sheet as well
 * as across it, so the face layer breaks along one line and the back along another a little way
 * off, and between the two the sheet's paler, fluffy inside shows. Loose fibres stand out past
 * the outermost line. Each edge here is those two lines and that band.
 *
 * A line wanders at every scale: a slow drift across the sheet, a ripple every few tens of
 * pixels and a fine roughness every two or three. Each scale is a band of sine waves with
 * whole-number frequencies over the tile, which makes the tile repeat without a seam, so a sheet
 * of any width lays copies of it side by side and the detail stays the same size however wide
 * the sheet is. The split between the lines is the same kind of noise, clipped at nothing, so
 * the inside shows in wide patches and narrow ones and here and there not at all.
 *
 * Each edge comes as three images of the same tile. The mask keeps the paper out to the outer
 * line and its fibres. The core covers the band between the lines and those fibres, uneven
 * inside, and the sheet paints its inner colour through it. The shade is drawn in black at low
 * alpha over that colour, so it reads on any paper: the face layer's hairline of shadow along
 * the inner line, and flecks where the fibres in the band overlap.
 */

const TILE = 640;
const STEP = 1.6;
/* Every coordinate is written in fifths of a pixel, so the path carries whole numbers. */
const UNIT = 5;

type Edge = { mask: string; core: string; shade: string };
/** A line or a curve as its points in order: from, to, or from, one or two controls, to. */
type Stroke = number[];

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

/** Numbers in a path, with a comma only where a minus sign does not already part them. */
const numbers = (values: number[]) => values.map((value, index) => (index === 0 || value < 0 ? `${value}` : `,${value}`)).join('');

/**
 * Many short strokes as one path, left to right, each one moved to from where the last one
 * ended, so every number in it is a small one.
 */
const draw = (strokes: Stroke[]) => {
  let d = '';
  let x = 0;
  let y = 0;
  for (const stroke of [...strokes].sort((a, b) => a[0] - b[0])) {
    const [x0, y0, ...rest] = stroke.map(Math.round);
    d += `${d ? 'm' : 'M'}${numbers(d ? [x0 - x, y0 - y] : [x0, y0])}`;
    d += `${rest.length === 6 ? 'c' : rest.length === 4 ? 'q' : 'l'}${numbers(rest.map((value, index) => value - (index % 2 === 0 ? x0 : y0)))}`;
    [x, y] = rest.slice(-2);
  }
  return d;
};

/**
 * @param seed  which tear; two seeds never tear alike
 * @param depth the height of the tile in pixels; the paper side is the bottom for a top edge
 * @param side  'top' keeps the paper under the edge, 'bottom' keeps it above
 */
export function tear(seed: number, depth: number, side: 'top' | 'bottom'): Edge {
  const next = random(seed);
  const samples = TILE / STEP;
  const clamp = (y: number) => Math.min(depth - 2, Math.max(2, y));

  /* The outer line, where the last of the paper ends, measured from the outside in. It is
     smooth at the finest scale: what roughens it is the fibres standing out past it. */
  const drift = band(next, samples, 1, 5, 2.4);
  const ripple = band(next, samples, 8, 48, 1);
  const rough = band(next, samples, 60, 180, 0.3);
  const outer = drift.map((_, i) => clamp(depth * 0.34 + drift[i] + ripple[i] + rough[i]));

  /* How far in the face layer broke: long strips, short tongues, and stretches where the two
     layers came apart together. The face line carries a roughness of its own. */
  const split = band(next, samples, 2, 34, 1);
  const faceRough = band(next, samples, 16, 90, 0.5);
  const gaps = split.map((value) => 2.3 * Math.max(0, value + 0.9) ** 1.15);
  const inner = outer.map((y, i) =>
    gaps[i] < 0.3 ? y : clamp(Math.max(y + 0.3, y + gaps[i] + faceRough[i] + (next() - 0.5) * 0.7)));

  const flip = (y: number) => (side === 'top' ? y : depth - y);
  const units = (values: number[]) => values.map((y) => Math.round(flip(y) * UNIT));
  const outline = units([...outer, outer[0]]);
  const faceline = units([...inner, inner[0]]);
  const inward = side === 'top' ? 1 : -1;

  const w = TILE * UNIT;
  const h = depth * UNIT;
  const paperSide = side === 'top' ? h : 0;
  const sampleAt = (x: number) => ((Math.round(x / (STEP * UNIT)) % samples) + samples) % samples;

  /* A stroke that runs off either end of the tile is drawn again one tile over, so the part
     that falls off one end comes back in on the other and the seam never shows. */
  const wrap = (stroke: Stroke): Stroke[] => {
    const xs = stroke.filter((_, index) => index % 2 === 0);
    const shifted = (by: number) => stroke.map((value, index) => (index % 2 === 0 ? value + by : value));
    return [stroke, ...(Math.min(...xs) < 0 ? [shifted(w)] : []), ...(Math.max(...xs) > w ? [shifted(-w)] : [])];
  };

  /** A fibre from a root, leaning off the normal and bowed a little. */
  const fibre = (x: number, root: number, length: number, lean: number) => {
    const tipX = x + Math.sin(lean) * length;
    const tipY = root - inward * Math.cos(lean) * length;
    const bow = (next() - 0.5) * length * 0.35;
    return wrap([x, root, (x + tipX) / 2 + bow, (root + tipY) / 2, tipX, tipY]);
  };

  /* Loose fibres past the outer line: a fuzz of short ones all along it, thicker where the
     inside is showing, and now and then a longer hair. */
  const fuzz: Stroke[] = [];
  const hair: Stroke[] = [];
  for (let n = 0; n < TILE * 1.1; n++) {
    const x = next() * w;
    const i = sampleAt(x);
    if (gaps[i] < 0.3 && next() < 0.5) continue;
    const root = outline[i] + inward * (0.2 + next() * 1.4) * UNIT;
    fuzz.push(...fibre(x, root, (0.6 + next() * 1.6) * UNIT, (next() - 0.5) * 2.4));
  }
  for (let n = 0; n < TILE / 10; n++) {
    const x = next() * w;
    const root = outline[sampleAt(x)] + inward * (0.8 + next()) * UNIT;
    hair.push(...fibre(x, root, (2 + next() * next() * 3.5) * UNIT, (next() - 0.5) * 1.8));
  }
  /* Stray fibres the tear pulled out: short, fine strands that curl as they go, a few to a
     tuft with long bare stretches between. They root near the outer line and lie out across
     it at a slant, and a slight blur leaves them a soft fuzz rather than distinct hairs. They
     are worked out in pixels from the outside in, and no point of one goes nearer the tile's
     edge than `margin`, so the curve, which stays inside its points, is never cut off. */
  const margin = 1.2;
  const px = (x: number, d: number) => [x * UNIT, flip(Math.min(depth - margin, Math.max(margin, d))) * UNIT];
  const strays: Stroke[] = [];
  const strand = (x: number, d: number, length: number, slant: number, way: number) => {
    const dx = way * Math.cos(slant) * length;
    const dd = -Math.sin(slant) * length;
    const bend = (next() - 0.5) * 0.5;
    const kink = next() < 0.35 ? -(0.6 + next()) : 0.5 + next();
    const off = (t: number, by: number) => px(x + dx * t - dd * by, d + dd * t + dx * by);
    strays.push(...wrap([...px(x, d), ...off(1 / 3, bend), ...off(2 / 3, bend * kink), ...px(x + dx, d + dd)]));
  };
  const rootAt = (x: number) => {
    const i = Math.round(x / STEP) % samples;
    return outer[i] + 0.3 + (inner[i] - outer[i]) * next() * 0.5;
  };
  for (let tuft = 0; tuft < TILE / 56; tuft++) {
    const middle = next() * TILE;
    const way = next() < 0.5 ? -1 : 1;
    const slant = 0.3 + next() * 0.9;
    for (let n = 2 + Math.floor(next() * 3); n > 0; n--) {
      const x = (middle + (next() - 0.5) * 8 + TILE) % TILE;
      strand(x, rootAt(x), 2 + next() * next() * 4, slant + (next() - 0.5) * 0.7, next() < 0.8 ? way : -way);
    }
  }
  const strayPath = draw(strays);
  const soften = `<filter id='s'><feGaussianBlur stdDeviation='${0.35 * UNIT}'/></filter>`;

  const fibres =
    soften +
    `<path d='${strayPath}' filter='url(#s)' stroke='#000' stroke-width='${0.6 * UNIT}' stroke-linecap='round' fill='none'/>` +
    `<path d='${draw(fuzz)}' stroke='#000' stroke-width='${0.3 * UNIT}' stroke-linecap='round' stroke-opacity='.6' fill='none'/>` +
    `<path d='${draw(hair)}' stroke='#000' stroke-width='${0.32 * UNIT}' stroke-linecap='round' stroke-opacity='.5' fill='none'/>`;

  /* The inside of the band: short fibres matted every which way, mostly along the tear. Most
     are paint, the rest throw a fleck of shadow on the band. */
  const matted: Stroke[] = [];
  const flecks: Stroke[] = [];
  for (let n = 0; n < TILE * 2.2; n++) {
    const x = next() * w;
    const i = sampleAt(x);
    const gap = faceline[i] - outline[i];
    if (Math.abs(gap) < 0.8 * UNIT) continue;
    const y = outline[i] + gap * next();
    const length = (1 + next() * 3) * UNIT;
    const angle = (next() - 0.5) * (next() < 0.7 ? 1 : 3.2);
    const dx = Math.cos(angle) * length;
    const dy = Math.sin(angle) * length;
    (next() < 0.3 ? flecks : matted).push(...wrap([x, y, x + dx, y + dy]));
  }

  const open = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}' preserveAspectRatio='none'>`;
  const paper = `<path d='M0,${paperSide}L0,${outline[0]}${run(outline)}L${w},${paperSide}Z'/>`;
  const back = [...faceline].reverse();
  const between = `M0,${outline[0]}${run(outline)}L${w},${back[0]}${run(back, -STEP * UNIT)}Z`;

  /* The face breaks fibre by fibre too, so its own loose ends lie over the band's inner side. */
  const overhang: Stroke[] = [];
  for (let n = 0; n < TILE * 0.8; n++) {
    const x = next() * w;
    const i = sampleAt(x);
    if (Math.abs(faceline[i] - outline[i]) < 0.8 * UNIT) continue;
    const root = faceline[i] + inward * 0.4 * UNIT;
    const reach = Math.min(Math.abs(faceline[i] - outline[i]), (0.6 + next() * 2) * UNIT);
    overhang.push(...fibre(x, root, reach, (next() - 0.5) * 2.2));
  }

  const core =
    `<defs><path id='p' d='${between}'/><clipPath id='b'><use href='#p'/></clipPath>` +
    `<mask id='f'><rect width='${w}' height='${h}' fill='#fff'/><path d='${draw(overhang)}' stroke='#000' stroke-width='${0.35 * UNIT}' stroke-linecap='round' fill='none'/></mask></defs>` +
    `<g mask='url(#f)'><use href='#p' fill-opacity='.78'/>` +
    `<path clip-path='url(#b)' d='${draw(matted)}' stroke='#000' stroke-width='${0.3 * UNIT}' stroke-linecap='round' fill='none'/></g>` +
    fibres;

  /* The face stands a layer's thickness proud of the band, so it throws a hairline of shadow
     just outside its own edge wherever the band is wide enough to catch it. The strays are
     drawn here again, faintly, so they stand out from the band, which is their own colour. */
  const wide = (i: number) => Math.abs(faceline[i] - outline[i]) > UNIT;
  const edge: Stroke[] = [];
  for (let i = 0; i < samples; i++) {
    if (!wide(i) || !wide(i + 1)) continue;
    const lift = inward * 0.4 * UNIT;
    edge.push([i * STEP * UNIT, faceline[i] - lift, (i + 1) * STEP * UNIT, faceline[i + 1] - lift]);
  }
  const hairline = draw(edge);
  const shade =
    `<path d='${hairline}' stroke='#000' stroke-width='${1.4 * UNIT}' stroke-opacity='.07' fill='none'/>` +
    `<path d='${hairline}' stroke='#000' stroke-width='${0.45 * UNIT}' stroke-opacity='.2' fill='none'/>` +
    `<path d='${draw(flecks)}' stroke='#000' stroke-width='${0.3 * UNIT}' stroke-linecap='round' stroke-opacity='.16' fill='none'/>` +
    soften +
    `<path d='${strayPath}' stroke='#000' filter='url(#s)' stroke-width='${0.6 * UNIT}' stroke-linecap='round' stroke-opacity='.1' fill='none'/>`;

  return {
    mask: encode(`${open}${paper}${fibres}</svg>`),
    core: encode(`${open}${core}</svg>`),
    shade: encode(`${open}${shade}</svg>`),
  };
}

/** The tile's width, which the sheet repeats its edges at. */
export const TEAR_TILE = `${TILE / 16}rem`;
