/**
 * Gives a sheet's title block back the cells its artwork leaves room for.
 *
 * Page.astro's fit ladder sheds the block's cells by the sheet's width alone, and its steps
 * are set by the pages whose artwork crowds the corner most. A sheet whose artwork stops well
 * short of the corner lost the same cells, with its bottom band empty beside the block. Here
 * each sheet's own artwork is measured: the rightmost ink in the band the block sits in, and
 * the width the block would take with each set of cells in each of its three arrangements
 * (a table, the logo dropped under the title, and that with the title on two lines). The
 * block keeps the most cells that fit, shed in the ladder's order, and within that the
 * arrangement nearest a plain table.
 *
 * It only ever gives cells back. The ladder stays the floor, so a demo that lays itself out
 * against the block's left edge (DragDrop, SpaceBuilder) reads the room as the block it
 * already has and keeps it, rather than trading width with the block from frame to frame.
 */

/** The ladder's steps, as the frame width they start at: `40em < width <= em`. */
const LADDER: readonly [number, string][] = [[50, 'T2'], [46, 'T3'], [43, 'S3'], [41, 'W3']];
const LADDER_FLOOR_EM = 40;

/** Table, stacked (the logo under the title), wrapped (the title on two lines as well). */
const ARRANGEMENTS = ['T', 'S', 'W'] as const;
type Arrangement = (typeof ARRANGEMENTS)[number];

/** How tall each arrangement runs at most, in the block's own em. */
const HEIGHT_EM: Record<Arrangement, number> = { T: 5.5, S: 8, W: 10 };

/** Page.astro's logo cell: `$title-tech-size` square in a table, 2.625em wide once stacked. */
const TECH_EM: Record<Arrangement, number> = { T: 4, S: 2.625, W: 2.625 };
/** The widest a wrapped title runs, the cell's padding and hairline included. */
const WRAP_REM = 11;
/** Clear paper kept between the artwork and the block. */
const CLEARANCE_REM = 0.5;

/** Anything this much of the sheet is the paper it is drawn on, not ink. */
const BACKDROP = 0.9;

const REPLACED = new Set(['IMG', 'CANVAS', 'VIDEO', 'IFRAME', 'INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'PROGRESS', 'METER']);

type Box = { left: number; top: number; right: number; bottom: number };

/** Every fit, best first: fewer cells shed, then the plainer arrangement. */
const FITS = [0, 1, 2, 3].flatMap((shed) => ARRANGEMENTS.map((arrangement) => `${arrangement}${shed}`));

export function ladderFit(frameEm: number): string | null {
  if (frameEm <= LADDER_FLOOR_EM) return null;
  let fit: string | null = null;
  for (const [em, step] of LADDER) if (frameEm <= em) fit = step;
  return fit;
}

let context: CanvasRenderingContext2D | null = null;
const widths = new Map<string, number>();

function textWidth(text: string, style: CSSStyleDeclaration): number {
  const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const key = `${font}\n${text}`;
  let width = widths.get(key);
  if (width === undefined) {
    context ??= document.createElement('canvas').getContext('2d');
    if (!context) return 0;
    context.font = font;
    width = context.measureText(text).width;
    widths.set(key, width);
  }
  return width;
}

export function forgetTextWidths() {
  widths.clear();
}

/** A cell's width with nothing squeezing it, one collapsed hairline included. Computed styles
    resolve on a cell the ladder hides as well, so a shed cell is measured the same way. */
function cellWidth(cell: HTMLElement | null): number {
  if (!cell) return 0;
  const style = getComputedStyle(cell);
  let content = 0;
  for (const text of cell.querySelectorAll<HTMLElement>('span:not(.sr-only), h2, h3')) {
    const words = text.textContent?.trim();
    if (words) content = Math.max(content, textWidth(words, getComputedStyle(text)));
  }
  const symbol = cell.querySelector('svg');
  if (symbol) content = Math.max(content, parseFloat(getComputedStyle(symbol).width) || 0);
  return content + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 1;
}

/** The block's width for every fit in FITS. */
function fitWidths(block: HTMLElement, rem: number): Map<string, number> {
  const cell = (name: string) => block.querySelector<HTMLElement>(`td.title-${name}`);
  const em = parseFloat(getComputedStyle(block).fontSize);
  const tech = cell('tech');
  const techPad = tech ? parseFloat(getComputedStyle(tech).paddingLeft) * 2 + 1 : 0;
  const name = cellWidth(cell('name'));
  const [no, scale, weight, date, proj] = ['no', 'scale', 'weight', 'date', 'proj'].map((n) => cellWidth(cell(n)));
  // Shed in the ladder's order: Proj., then Scale, then Weight.
  const rows = [no + scale + weight + date + proj, no + scale + weight + date, no + weight + date, no + date];

  const out = new Map<string, number>();
  rows.forEach((row, shed) => {
    for (const arrangement of ARRANGEMENTS) {
      const logo = tech ? TECH_EM[arrangement] * em + techPad : 0;
      const width = arrangement === 'T' ? logo + Math.max(name, row)
        : arrangement === 'S' ? Math.max(name, logo + row)
        : Math.max(logo + row, Math.min(name, WRAP_REM * rem));
      out.set(`${arrangement}${shed}`, width);
    }
  });
  return out;
}

/**
 * The sheet's frame of reference: every page but the front one is turned a little in the fan,
 * so client rects are turned back into the sheet's own layout coordinates before they are
 * compared with the block's. The centres of two boxes whose layout positions are known (the
 * sheet's and the block's) give the turn; the centre of a turned box is where its client
 * rect's centre is, so the map is exact for centres and a rect keeps its client size.
 */
function sheetFrame(sheet: HTMLElement, block: HTMLElement) {
  const s = sheet.getBoundingClientRect();
  const b = block.getBoundingClientRect();
  const sheetCentre = { x: sheet.offsetWidth / 2, y: sheet.offsetHeight / 2 };
  const blockCentre = {
    x: sheet.clientLeft + block.offsetLeft + block.offsetWidth / 2,
    y: sheet.clientTop + block.offsetTop + block.offsetHeight / 2,
  };
  const client = { x: s.left + s.width / 2, y: s.top + s.height / 2 };
  const u = { x: b.left + b.width / 2 - client.x, y: b.top + b.height / 2 - client.y };
  const v = { x: blockCentre.x - sheetCentre.x, y: blockCentre.y - sheetCentre.y };
  const turn = Math.atan2(u.y, u.x) - Math.atan2(v.y, v.x);
  const scale = Math.hypot(u.x, u.y) / (Math.hypot(v.x, v.y) || 1) || 1;
  const cos = Math.cos(-turn);
  const sin = Math.sin(-turn);

  return (rect: DOMRect): Box => {
    const dx = rect.left + rect.width / 2 - client.x;
    const dy = rect.top + rect.height / 2 - client.y;
    const x = sheetCentre.x + (dx * cos - dy * sin) / scale;
    const y = sheetCentre.y + (dx * sin + dy * cos) / scale;
    const w = rect.width / scale / 2;
    const h = rect.height / scale / 2;
    return { left: x - w, top: y - h, right: x + w, bottom: y + h };
  };
}

function painted(el: Element): boolean {
  const style = getComputedStyle(el);
  return parseFloat(style.borderTopWidth) > 0
    || parseFloat(style.borderRightWidth) > 0
    || parseFloat(style.borderBottomWidth) > 0
    || parseFloat(style.borderLeftWidth) > 0
    || style.backgroundImage !== 'none'
    || style.boxShadow !== 'none'
    || !/^(transparent|rgba\(.*,\s*0\))$/.test(style.backgroundColor);
}

/**
 * How far right the ink reaches in each band above the block's bottom, the bands' tops given
 * lowest first: text, pictures, controls, the top-level shapes of every drawing, any box that
 * draws a border or a fill, and the note's tab in the corner. A box is only looked into when
 * its own edge would move a band's, which leaves the ranges and computed styles to the few
 * boxes that reach the corner.
 */
function inkEdges(sheet: HTMLElement, frame: (rect: DOMRect) => Box, tops: number[], bottom: number, right: number): number[] {
  const edges = tops.map(() => 0);
  const artwork = sheet.querySelector<HTMLElement>(':scope > .content');
  if (!artwork) return edges;
  const range = document.createRange();
  const reach = (box: Box) => {
    if (box.top >= bottom || box.left >= right) return -1;
    const band = tops.findIndex((top) => box.bottom > top);
    if (band < 0 || Math.min(box.right, right) <= edges[band]) return -1;
    if (box.right - box.left > sheet.offsetWidth * BACKDROP && box.bottom - box.top > sheet.offsetHeight * BACKDROP) return -1;
    return band;
  };
  const take = (box: Box, band: number) => {
    for (let i = band; i < edges.length; i += 1) edges[i] = Math.max(edges[i], Math.min(box.right, right));
  };
  const look = (rect: DOMRect) => {
    if (rect.width === 0 && rect.height === 0) return;
    const box = frame(rect);
    const band = reach(box);
    if (band >= 0) take(box, band);
  };

  const tab = sheet.querySelector(':scope > .aside .note-fold');
  if (tab) look(tab.getBoundingClientRect());

  for (const el of artwork.querySelectorAll('*')) {
    if (el instanceof SVGElement) {
      if (el.parentElement instanceof SVGSVGElement && !(el instanceof SVGSVGElement)
        && el instanceof SVGGraphicsElement) look(el.getBoundingClientRect());
      continue;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    const box = frame(rect);
    if (reach(box) < 0) continue;
    if (REPLACED.has(el.tagName) || painted(el)) {
      take(box, reach(box));
      continue;
    }
    for (let node = el.firstChild; node; node = node.nextSibling) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
        range.selectNodeContents(el);
        look(range.getBoundingClientRect());
        break;
      }
    }
  }
  return edges;
}

export type TitleFit = { sheet: HTMLElement; fit: string | null };

/** Measures a sheet without writing to it. A `null` fit leaves the sheet on the ladder. */
export function readTitleFit(sheet: HTMLElement): TitleFit {
  const block = sheet.querySelector<HTMLElement>(':scope > table');
  const frame = sheet.closest<HTMLElement>('.technical-drawing-frame');
  if (!block || !frame) return { sheet, fit: null };

  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const ladder = ladderFit(frame.clientWidth / (parseFloat(getComputedStyle(frame).fontSize) || rem));
  if (!ladder) return { sheet, fit: null };

  const em = parseFloat(getComputedStyle(block).fontSize);
  const clearance = CLEARANCE_REM * rem;
  const right = sheet.clientLeft + block.offsetLeft + block.offsetWidth;
  const bottom = sheet.clientTop + block.offsetTop + block.offsetHeight;
  const bandTop = (arrangement: Arrangement) => bottom - HEIGHT_EM[arrangement] * em - clearance;
  const edges = inkEdges(sheet, sheetFrame(sheet, block), ARRANGEMENTS.map(bandTop), bottom, right);
  const room = (arrangement: Arrangement) => right - clearance - edges[ARRANGEMENTS.indexOf(arrangement)];

  const widths = fitWidths(block, rem);
  const best = FITS.find((fit) => (widths.get(fit) ?? Infinity) <= room(fit[0] as Arrangement));
  return { sheet, fit: best && FITS.indexOf(best) < FITS.indexOf(ladder) ? best : null };
}

export function writeTitleFit({ sheet, fit }: TitleFit) {
  const value = fit ?? undefined;
  if (sheet.dataset.titleFit === value) return;
  if (value === undefined) delete sheet.dataset.titleFit;
  else sheet.dataset.titleFit = value;
}
