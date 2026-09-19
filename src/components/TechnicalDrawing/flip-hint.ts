type Point = { x: number; y: number };

const shift = (from: Point, along: Point, by = 1): Point => ({ x: from.x + along.x * by, y: from.y + along.y * by });
const unit = (v: Point): Point => {
  const length = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / length, y: v.y / length };
};
const turn = (v: Point, radians: number): Point => ({
  x: v.x * Math.cos(radians) - v.y * Math.sin(radians),
  y: v.x * Math.sin(radians) + v.y * Math.cos(radians),
});
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const at = (p: Point) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;

/**
 * One arrow from the end of a sentence to the middle of a crease.
 *
 * Two things are fixed: the tail, which is where the words stop, and the tip, which stops a
 * little short of the crease's middle on the crease's own normal and has to arrive along it — an
 * arrow that comes in at a slant says nothing about which way the paper travels. Everything
 * between them is the hand's business, and the hand does not draw straight: the line bows out to
 * the side the words are not on, wanders past its own middle, and the two barbs of the head are
 * different lengths and miss the tip by different amounts. `em` is the hint's type size, so the
 * drawing keeps its proportions when the words shrink.
 */
/** A line through the given points, each bend taken as wide as the neighbouring points allow. */
function through(points: Point[], last?: Point): string {
  const ends = [points[0], ...points, points[points.length - 1]];
  const out = [`M ${at(points[0])}`];
  for (let i = 1; i < ends.length - 2; i += 1) {
    const one = { x: ends[i].x + (ends[i + 1].x - ends[i - 1].x) / 6, y: ends[i].y + (ends[i + 1].y - ends[i - 1].y) / 6 };
    const two = { x: ends[i + 1].x - (ends[i + 2].x - ends[i].x) / 6, y: ends[i + 1].y - (ends[i + 2].y - ends[i].y) / 6 };
    out.push(`C ${at(one)} ${at(i === ends.length - 3 && last ? last : two)} ${at(ends[i + 1])}`);
  }
  return out.join(' ');
}

export function arrowPaths(tail: Point, tip: Point, normal: Point, away: Point, em: number) {
  const reach = Math.hypot(tip.x - tail.x, tip.y - tail.y);
  const forward = unit({ x: tip.x - tail.x, y: tip.y - tail.y });

  let side = { x: -forward.y, y: forward.x };
  if (side.x * away.x + side.y * away.y < 0) side = { x: -side.x, y: -side.y };

  const bow = clamp(reach * 0.16, em * 0.375, em * 1.625);
  const wander = em * 0.25;
  // How far back from the tip the line is already running along the normal.
  const square = clamp(reach * 0.42, em * 0.875, em * 3);

  const on = (along: number, across: number) => shift(shift(tail, forward, reach * along), side, across);
  const bend = [tail, on(0.34, bow * 0.88 + wander * 0.4), on(0.68, bow * 0.86 - wander * 0.5), tip];
  const shaft = through(bend, shift(tip, normal, square));

  // The marker went back over the middle of the line and did not land on it.
  const drift = em * 0.1875;
  const pass = through([
    on(0.14, bow * 0.42 + drift),
    on(0.36, bow * 0.88 + drift * 1.4),
    on(0.62, bow * 0.9 + drift),
  ]);

  const barb = clamp(reach * 0.3, em * 0.5, em * 0.875);
  const head = [
    `M ${at(shift(tip, turn(normal, 0.46), barb))} L ${at(shift(tip, normal, em * 0.0625))}`,
    `M ${at(shift(tip, turn(normal, -0.62), barb * 0.82))} L ${at(shift(tip, normal, em * -0.0625))}`,
  ].join(' ');

  return { shaft, pass, head };
}

/** The lengths the stack keeps its fold in, resolved by the browser rather than parsed. */
function lengths(host: HTMLElement, values: string[]): number[] {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;visibility:hidden;height:0';
  host.append(probe);
  const out = values.map((value) => {
    probe.style.width = value || '0px';
    return probe.getBoundingClientRect().width;
  });
  probe.remove();
  return out;
}

/**
 * Where the last line of a paragraph stops, and the way the writing was running when it got
 * there. The line's own box, not the paragraph's: a right-aligned block or one held short by a
 * max-width is wider than the words in it.
 */
function wordsEnd(words: HTMLElement, origin: DOMRect) {
  const range = document.createRange();
  range.selectNodeContents(words);
  const lines = [...range.getClientRects()];
  const last = lines[lines.length - 1] ?? words.getBoundingClientRect();
  const onward = getComputedStyle(words).direction === 'rtl' ? -1 : 1;
  return {
    end: {
      x: (onward > 0 ? last.right : last.left) - origin.left,
      y: last.top + last.height / 2 - origin.top,
    },
    away: { x: onward, y: 0 },
  };
}

/**
 * The colours of the paper the hints are written on: what the halo under a stroke has to carry,
 * and what the sheet itself would write an accent in. The hint layer is the stack's sibling, so
 * neither reaches it by inheritance, and a blueprint page redefines both — its accent is near
 * white, and the page's own dark-orange marker vanishes into the blue at 1.01:1.
 */
function paper(front: HTMLElement): { fill: string; ink: string } {
  const sheet = front.querySelector('section') ?? front;
  let fill = 'transparent';
  for (let el: Element | null = sheet; el; el = el.parentElement) {
    const colour = getComputedStyle(el).backgroundColor;
    if (colour && !/^(transparent$|rgba\(.*,\s*0\s*\))/.test(colour)) { fill = colour; break; }
  }
  return { fill, ink: getComputedStyle(sheet).getPropertyValue('--accent-text').trim() };
}

/**
 * Draws both hints of a frame, and tells the CSS where on the sheet the words go.
 *
 * Both sentences live on the paper: under the sheet there is only the fan's reserve, and on a
 * narrow page that reserve is thinner than a line of marker, so the words ended up on the grid
 * between two stacks. Each one sits in the sheet's own margin, clear of the fold it is about
 * and clear of the title block, and the arrow then runs inward-out: it starts at the words,
 * crosses the paper and stops just short of the crease, arriving square to it.
 *
 * The arrows are plain overlays on the frame's own box — a viewBox in CSS pixels, so everything
 * here is measured in the same units it is drawn in — and both are redrawn whenever the stack is
 * resized, because the words wrap differently and the fold's corner moves with the sheet.
 */
export function drawFlipHints(frame: HTMLElement): void {
  const hints = frame.querySelector<HTMLElement>('.flip-hints');
  const stack = frame.querySelector<HTMLElement>('article.technical-drawing-stack');
  const front = stack?.querySelector<HTMLElement>('.paper-front');
  if (!hints || !stack || !front) return;

  const origin = hints.getBoundingClientRect();
  const sheet = front.getBoundingClientRect();
  const style = getComputedStyle(stack);
  const [foldX, foldY, backX, backY] = lengths(stack, [
    '--fold-rest-x', '--fold-rest-y', '--fold-back-rest-x', '--fold-back-rest-y',
  ].map((name) => style.getPropertyValue(name).trim()));

  // The title block is the one part of the sheet that is already written on, and on a portrait
  // page it runs the full width, so the words stop above it rather than beside it.
  const block = front.querySelector('table')?.getBoundingClientRect();
  const written = Math.min(block?.top ?? Infinity, sheet.bottom - foldY);

  for (const [name, value] of Object.entries({
    '--hint-sheet-left': sheet.left - origin.left,
    '--hint-sheet-top': sheet.top - origin.top,
    '--hint-sheet-right': origin.right - sheet.right,
    '--hint-sheet-inline': sheet.width,
    '--hint-fold-x': foldX,
    '--hint-fold-back-y': backY,
    '--hint-written': origin.bottom - written,
  })) hints.style.setProperty(name, `${value.toFixed(1)}px`);

  const { fill, ink } = paper(front);
  hints.style.setProperty('--hint-paper', fill);
  if (ink) hints.style.setProperty('--hint-ink', ink);

  // The dog-ear cuts the sheet's bottom-right corner, the folded-away one its top-left; both
  // creases run between the two intercepts, and the normal points across it into the paper,
  // which is the side the words are on and so the side the arrow has to come from.
  const creases = {
    fwd: {
      middle: { x: sheet.right - foldX / 2 - origin.left, y: sheet.bottom - foldY / 2 - origin.top },
      normal: unit({ x: -foldY, y: -foldX }),
    },
    back: {
      middle: { x: sheet.left + backX / 2 - origin.left, y: sheet.top + backY / 2 - origin.top },
      normal: unit({ x: backY, y: backX }),
    },
  } as const;

  for (const way of ['fwd', 'back'] as const) {
    const words = hints.querySelector<HTMLElement>(`.flip-hint--${way}.hint-words`);
    const arrow = hints.querySelector<SVGSVGElement>(`.flip-hint--${way}.hint-arrow`);
    if (!words || !arrow) continue;

    const em = parseFloat(getComputedStyle(words).fontSize) || 16;
    const { end, away } = wordsEnd(words, origin);
    const { middle, normal } = creases[way];
    const tip = shift(middle, normal, em * 0.5);
    const paths = arrowPaths(shift(end, away, em * 0.375), tip, normal, away, em);

    arrow.setAttribute('viewBox', `0 0 ${origin.width.toFixed(1)} ${origin.height.toFixed(1)}`);
    for (const [part, d] of Object.entries(paths)) {
      arrow.querySelectorAll<SVGPathElement>(`.hint-${part}, .hint-${part}-halo`)
        .forEach((path) => path.setAttribute('d', d));
    }
  }
}
