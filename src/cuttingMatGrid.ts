/**
 * The cutting mat's ruling, as one SVG tile per device pixel ratio.
 *
 * Two repeating linear gradients drew it before, one per axis, and each rounded its own 1px
 * stops to the pixel grid wherever they fell, so neighbouring lines came out one or two device
 * pixels wide and lighter or darker at every ratio but 2. A tile is rasterised once and
 * repeated, so every cell is the same, and drawing it in device pixels puts every line on
 * whole ones: a tile is 5 cells of 8 CSS px, each line starts on a whole device pixel, and it
 * is as many device pixels wide as there are to one CSS pixel, rounded. Where rounding widens
 * a line, it is fainter by as much, so a line carries the same ink at every ratio.
 *
 * The tile is a mask and not a picture, because the ink is the theme's (--mat-grid-major): the
 * major line takes it whole, the minor lines half of it. Minor lines stop short of the major
 * ones, and each set is one path, so no crossing takes two coats.
 */

const CELL = 8;
const CELLS = 5;

/** Chrome's zoom steps from 50% to 300% on a 1x screen, and the common screens' own ratios. */
const RATIOS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 3, 3.5, 4];

const tile = (ratio: number) => {
  const size = Math.round(CELL * CELLS * ratio);
  const line = Math.max(1, Math.round(ratio));
  const ink = Math.min(1, ratio / line);
  const at = (cell: number) => Math.round(CELL * cell * ratio);
  const bar = (x: number, y: number, w: number, h: number) => `M${x} ${y}h${w}v${h}h${-w}z`;

  const minor = [1, 2, 3, 4]
    .map((cell) => bar(at(cell), line, line, size - line) + bar(line, at(cell), size - line, line))
    .join('');
  const major = bar(0, 0, line, size) + bar(line, 0, size - line, line);
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${size} ${size}' shape-rendering='crispEdges'>`
    + `<path fill-opacity='${+(ink / 2).toFixed(4)}' d='${minor}'/>`
    + `<path fill-opacity='${+ink.toFixed(4)}' d='${major}'/>`
    + '</svg>';

  return {
    image: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
    size: `${+(size / ratio).toFixed(4)}px`,
  };
};

const vars = (ratio: number) => {
  const { image, size } = tile(ratio);
  return `--mat-tile: ${image}; --mat-tile-size: ${size};`;
};

/** A rule per ratio, each taking the resolutions nearer to it than to its neighbours. */
export const MAT_GRID_CSS = [
  `.cutting-mat { ${vars(1)} }`,
  ...RATIOS.map((ratio, index) => {
    const low = index > 0 ? (RATIOS[index - 1] + ratio) / 2 : 0;
    const high = index < RATIOS.length - 1 ? (ratio + RATIOS[index + 1]) / 2 : Infinity;
    const query = [
      low > 0 ? `(resolution >= ${low}dppx)` : '',
      Number.isFinite(high) ? `(resolution < ${high}dppx)` : '',
    ].filter(Boolean).join(' and ');
    return `@media ${query} { .cutting-mat { ${vars(ratio)} } }`;
  }),
].join('\n');
