/**
 * The desk top at wide viewports: a run of plain boards, drawn once as an SVG tile and
 * repeated behind the sheets.
 *
 * One generator, four woods. Every theme passes its own numbers to `plankTile` and gets back a
 * `url(...)` for `--theme-desk-tile`, so the page still loads one image per theme and changing
 * theme swaps it.
 *
 * How a board gets its figure: `feTurbulence` at a high frequency across the grain and a very
 * low one along it gives long streaks, where a fine noise warped by a large displacement gives
 * the swirls and eyes of burl. A second, slow noise bends those streaks a few pixels sideways
 * so they are not ruled lines, but never so far in one line's width that a line closes on
 * itself. The bend is sideways only: the noise's alpha is flattened to the neutral 0.5 first,
 * so nothing is pulled along the grain and the tile keeps its top and bottom edges intact.
 *
 * Each board is its own filtered rect, drawn from a different stretch of the same noise, so the
 * figure changes at every joint; the rect's own fill carries that board's tone into the filter.
 *
 * The tile joins itself on all four sides. Across: the tile is a whole number of boards and its
 * first pixel is a joint, so nothing has to line up. Down: `stitchTiles` makes both noises
 * repeat over the tile's length, so every board meets itself.
 */

/** The tile's side, in user units and in rem: the page paints it at 1:1 at a 16px root. */
export const DESK_TILE = 720;
export const DESK_TILE_REM = DESK_TILE / 16;

export type PlankTile = {
  /** Which way the boards run: down the desk, or across it. */
  lie: 'down' | 'across';
  /** Picks the noise, and the run of board tones and phases. */
  seed: number;
  /** Boards across the tile. The tile is a whole number of them, so its join is a joint. */
  boards: number;
  /** Grain lines across one board. */
  lines: number;
  /** How many times a line drifts back and forth over the tile's length. */
  waves: number;
  /** 1 gives smooth streaks; 2 breaks them up the way a sawn face does. */
  octaves: number;
  /** How far, in user units, the grain bends sideways. Small: lines stay lines. */
  bend: number;
  /** How hard the grain is pushed, before the theme's veil takes most of it back. */
  grain: number;
  /** Half the tone step between two boards, as a fraction of white. */
  boardTone: number;
  /** Half the hue step between two boards. Positive is warmer. */
  boardWarmth: number;
  /** The joint between two boards: a dark hairline with a lighter edge beside it. */
  seam: number;
  /** Fine crazing over the grain, the way char cracks along it. Left out at 0. */
  char?: number;
  /** One pale streak of sapwood down a board's edge. Left out at 0. */
  sapwood?: number;
};

/** Small, fast, and the same everywhere, so a theme's boards never change under us. */
const random = (seed: number) => {
  let state = (seed * 0x6d2b79f5) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const round = (value: number, places = 5) => Number(value.toFixed(places));

/** 0.5 is the tile's neutral: blended `overlay` onto the desk colour it changes nothing. */
const channel = (offset: number) => Math.min(255, Math.max(0, Math.round(128 + offset * 255)));

const hex = (tone: number, warmth: number) =>
  [channel(tone + warmth), channel(tone), channel(tone - warmth)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');

export const plankTile = (tile: PlankTile) => {
  const {
    lie, seed, boards, lines, waves, octaves, bend, grain, boardTone, boardWarmth, seam,
    char = 0, sapwood = 0,
  } = tile;

  const board = DESK_TILE / boards;
  const next = random(seed);

  /* Both noises are stitched over the tile, so they repeat exactly down its length however
     much of them a board is drawn from. */
  const stitch = (frequency: string, octaveCount: number, noiseSeed: number, result: string) =>
    `%3CfeTurbulence type='fractalNoise' baseFrequency='${frequency}' numOctaves='${octaveCount}'`
    + ` seed='${noiseSeed}' stitchTiles='stitch' x='0' y='0' width='${DESK_TILE}'`
    + ` height='${DESK_TILE}' result='${result}'/%3E`;

  /* Grey, centred on the tile's neutral, from one channel of a noise. */
  const grey = (input: string, amount: number, result: string) => {
    const row = `${amount} 0 0 0 ${round(0.5 - amount * 0.5)}`;
    return `%3CfeColorMatrix in='${input}' type='matrix' values='${row} ${row} ${row} 0 0 0 0 1' result='${result}'/%3E`;
  };

  /* A board's rect is padded sideways by a tenth of its width, which is more than the bend can
     pull, and not at all along the grain, where there is nothing to pull. */
  const filter = [
    `%3Cfilter id='b' x='-10%25' y='0' width='120%25' height='100%25' color-interpolation-filters='sRGB'%3E`,
    stitch(`${round((lines * boards) / DESK_TILE)} ${round(waves / DESK_TILE)}`, octaves, seed, 'n'),
    stitch(`${round(2 / DESK_TILE)}`, 2, seed + 41, 'v0'),
    `%3CfeColorMatrix in='v0' type='matrix' values='1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 0 0.5' result='v'/%3E`,
    `%3CfeDisplacementMap in='n' in2='v' scale='${bend}' xChannelSelector='R' yChannelSelector='A' result='w'/%3E`,
    grey('w', grain, char > 0 ? 'f' : 'g'),
    ...(char > 0
      ? [
        stitch(`${round((lines * boards * 3) / DESK_TILE)} ${round((lines * boards) / DESK_TILE)}`, 2, seed + 83, 'c'),
        grey('c', char, 'k'),
        `%3CfeComposite in='f' in2='k' operator='arithmetic' k2='1' k3='1' k4='-0.5' result='g'/%3E`,
      ]
      : []),
    /* The board's own tone rides in on the rect's fill; the rect's alpha then trims the grain
       back to the board, so no two boards overlap. */
    `%3CfeComposite in='g' in2='SourceGraphic' operator='arithmetic' k2='1' k3='1' k4='-0.5' result='t'/%3E`,
    `%3CfeComposite in='t' in2='SourceGraphic' operator='in'/%3E`,
    '%3C/filter%3E',
  ].join('');

  const planks: string[] = [];
  const joints: string[] = [];
  const pad = Math.ceil(board * 0.1) + 1;
  /* The stretch of noise a board is cut from. It has to sit inside the stitched tile with room
     for the bend on both sides, since outside it there is no noise to pull from. */
  const span = DESK_TILE - board - pad * 2;
  let sapwoodAt = sapwood > 0 ? Math.floor(next() * boards) : -1;

  for (let index = 0; index < boards; index += 1) {
    const at = index * board;
    const from = pad + Math.round(next() * span);
    const fill = hex((next() * 2 - 1) * boardTone, (next() * 2 - 1) * boardWarmth);
    planks.push(
      `%3Crect x='${from}' y='0' width='${board}' height='${DESK_TILE}' fill='%23${fill}'`
      + ` filter='url(%23b)' transform='translate(${at - from} 0)'/%3E`,
    );
    /* The joint is the board's own first pixel, so the one at x=0 serves the tile's join and
       nothing straddles the edge. */
    joints.push(
      `%3Crect x='${at}' width='1' height='${DESK_TILE}' fill='%23000' opacity='${seam}'/%3E`
      + `%3Crect x='${at + 1}' width='1' height='${DESK_TILE}' fill='%23fff' opacity='${round(seam * 0.55, 3)}'/%3E`,
    );
    if (index === sapwoodAt) {
      joints.push(`%3Crect x='${at + 3}' width='14' height='${DESK_TILE}' fill='url(%23s)' opacity='${sapwood}'/%3E`);
      sapwoodAt = -1;
    }
  }

  const sap = sapwood > 0
    ? `%3ClinearGradient id='s' x2='1' y2='0'%3E%3Cstop offset='0' stop-color='%23fff' stop-opacity='0'/%3E`
      + `%3Cstop offset='0.5' stop-color='%23fff'/%3E%3Cstop offset='1' stop-color='%23fff' stop-opacity='0'/%3E%3C/linearGradient%3E`
    : '';

  const turn = lie === 'across' ? ` transform='rotate(90 ${DESK_TILE / 2} ${DESK_TILE / 2})'` : '';

  return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${DESK_TILE}'`
    + ` height='${DESK_TILE}'%3E%3Cdefs%3E${filter}${sap}%3C/defs%3E%3Cg${turn}%3E`
    + `${planks.join('')}${joints.join('')}%3C/g%3E%3C/svg%3E")`;
};
