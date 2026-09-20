/**
 * Draws each flip hint's arrow from measurements: the tail at the words, the head on the
 * middle of the crease it points at, arriving square to it.
 *
 * The stylesheet places the words and, without script, a stock arrow beside the crease. That
 * arrow is one fixed shape, so it can only start where the words happen to end at one width.
 * Here the shaft is a single cubic from the words' box to the crease: it leaves the words along
 * the line of reading (out of the end of the peel hint, down and out of the start of the way
 * back), and its last handle lies on the crease's outer normal, so the head comes in
 * perpendicular to the fold. The head's barbs and a lighter second pass over the tail are
 * redrawn from the same points, so the arrow keeps its hand.
 *
 * The creases are the ones PaperStack publishes: the dog-ear's resting intercepts
 * (`--fold-rest-x/y`, from the sheet's bottom-right corner) and the folded-back corner's
 * (`--fold-back-rest-x/y`, from its top-left). Redrawn when the stack or the words change
 * size, which covers the viewport and the font arriving, and when the stack marks a turn.
 *
 * The shared annotation script was not a fit: it anchors a callout to an element of a page's
 * artwork, and the crease is not an element but a line the stack's clip-path draws.
 */

type Point = { x: number; y: number };
type Way = 'fwd' | 'back';

/** How far the nib stops short of the paper, along the normal. */
const NIB_GAP = 4;
/** Room between the words' box and the tail. */
const TAIL_GAP = 4;
/** The head's two barbs: back along the shaft at these angles, this long, missing the tip. */
const BARBS = [
  { angle: 31, length: 12, miss: { x: 0.4, y: -0.3 } },
  { angle: -33, length: 10.5, miss: { x: -0.2, y: 0.5 } },
];

const frames = new WeakMap<HTMLElement, () => void>();

const lengthsOf = (el: Element, ...names: string[]) => {
  const style = getComputedStyle(el);
  return names.map((name) => style.getPropertyValue(name).trim());
};

/** A length in whatever unit the stack wrote it, resolved by the browser against `el`. */
function px(el: HTMLElement, value: string) {
  const probe = document.createElement('div');
  probe.style.cssText = `position:absolute;visibility:hidden;width:${value || '0px'}`;
  el.appendChild(probe);
  const width = probe.getBoundingClientRect().width;
  probe.remove();
  return width;
}

const unit = (v: Point) => {
  const length = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / length, y: v.y / length };
};
const add = (a: Point, b: Point, k = 1) => ({ x: a.x + b.x * k, y: a.y + b.y * k });
const rotate = ({ x, y }: Point, degrees: number) => {
  const r = (degrees * Math.PI) / 180;
  return { x: x * Math.cos(r) - y * Math.sin(r), y: x * Math.sin(r) + y * Math.cos(r) };
};
const at = ({ x, y }: Point) => `${x.toFixed(1)} ${y.toFixed(1)}`;

/** The front part of a cubic, split at `t`. */
function splitCubic([p0, p1, p2, p3]: Point[], t: number): Point[] {
  const lerp = (a: Point, b: Point) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const p01 = lerp(p0, p1);
  const p12 = lerp(p1, p2);
  const p23 = lerp(p2, p3);
  const p012 = lerp(p01, p12);
  const p123 = lerp(p12, p23);
  return [p0, p01, p012, lerp(p012, p123)];
}

type Crease = { a: Point; b: Point; corner: Point };

function draw(svg: SVGSVGElement, box: DOMRect, words: DOMRect, crease: Crease, way: Way) {
  const middle = { x: (crease.a.x + crease.b.x) / 2, y: (crease.a.y + crease.b.y) / 2 };
  const edge = { x: crease.b.x - crease.a.x, y: crease.b.y - crease.a.y };
  let out = unit({ x: -edge.y, y: edge.x });
  if ((crease.corner.x - middle.x) * out.x + (crease.corner.y - middle.y) * out.y < 0) {
    out = { x: -out.x, y: -out.y };
  }
  const tip = add(middle, out, NIB_GAP);

  // The peel hint reads on to its arrow, so the tail picks up where the words stop; the way
  // back's words sit above the corner they name, so the tail drops out of their first letter.
  const tail = way === 'fwd'
    ? { x: words.right - box.left + TAIL_GAP, y: words.top - box.top + words.height / 2 }
    : { x: words.left - box.left - TAIL_GAP, y: words.top - box.top + words.height / 2 };
  const leave = way === 'fwd' ? { x: 1, y: 0 } : unit({ x: -0.6, y: 0.8 });

  const reach = Math.hypot(tip.x - tail.x, tip.y - tail.y);
  const handle = Math.max(12, reach * 0.45);
  const shaft = [tail, add(tail, leave, handle), add(tip, out, handle), tip];
  const across = { x: -leave.y, y: leave.x };
  const pass = splitCubic(shaft, 0.55).map((p) => add(p, across, 1));
  const head = BARBS.map(({ angle, length, miss }) => {
    const start = add(tip, miss);
    return `M${at(add(start, rotate(out, angle), length)) } L${at(start)}`;
  }).join(' ');

  const cubic = ([p0, p1, p2, p3]: Point[]) => `M${at(p0)} C ${at(p1)}, ${at(p2)}, ${at(p3)}`;
  svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
  const paths = (selector: string) => [...svg.querySelectorAll<SVGPathElement>(selector)];
  const [shaftHalo, headHalo] = paths('.hint-halo');
  const set = (path: SVGPathElement | undefined, d: string) => path?.setAttribute('d', d);
  paths('.hint-shaft').forEach((path) => set(path, cubic(shaft)));
  paths('.hint-head').forEach((path) => set(path, head));
  paths('.hint-pass').forEach((path) => set(path, cubic(pass)));
  set(shaftHalo, cubic(shaft));
  set(headHalo, head);
}

function layout(frame: HTMLElement) {
  const layer = frame.querySelector<HTMLElement>('.flip-hints');
  const stack = frame.querySelector<HTMLElement>('article.technical-drawing-stack');
  if (!layer || !stack || getComputedStyle(layer).display === 'none') return;

  const box = layer.getBoundingClientRect();
  const sheet = stack.getBoundingClientRect();
  const [restX, restY, leanX, leanY] = lengthsOf(
    stack, '--fold-rest-x', '--fold-rest-y', '--fold-back-rest-x', '--fold-back-rest-y',
  ).map((value) => px(stack, value));
  const s = {
    left: sheet.left - box.left,
    top: sheet.top - box.top,
    right: sheet.right - box.left,
    bottom: sheet.bottom - box.top,
  };
  const creases: Record<Way, Crease> = {
    fwd: {
      a: { x: s.right - restX, y: s.bottom },
      b: { x: s.right, y: s.bottom - restY },
      corner: { x: s.right, y: s.bottom },
    },
    back: {
      a: { x: s.left + leanX, y: s.top },
      b: { x: s.left, y: s.top + leanY },
      corner: { x: s.left, y: s.top },
    },
  };

  const measured: { way: Way; svg: SVGSVGElement; words: DOMRect }[] = [];
  for (const way of ['fwd', 'back'] as Way[]) {
    const words = layer.querySelector<HTMLElement>(`.flip-hint--${way}.hint-words`);
    const svg = layer.querySelector<SVGSVGElement>(`.flip-hint--${way}.hint-arrow`);
    if (words && svg) measured.push({ way, svg, words: words.getBoundingClientRect() });
  }
  layer.setAttribute('data-hint-drawn', '');
  for (const { way, svg, words } of measured) draw(svg, box, words, creases[way], way);
}

/** Lays the frame's hint arrows out now and again whenever their ends move. */
export function drawFlipHints(frame: HTMLElement) {
  if (frames.has(frame)) { frames.get(frame)!(); return; }

  let queued = 0;
  const schedule = () => {
    if (queued) return;
    queued = requestAnimationFrame(() => { queued = 0; layout(frame); });
  };
  frames.set(frame, schedule);

  const stack = frame.querySelector<HTMLElement>('article.technical-drawing-stack');
  const sized = new ResizeObserver(schedule);
  if (stack) sized.observe(stack);
  frame.querySelectorAll<HTMLElement>('.flip-hints .hint-words').forEach((words) => sized.observe(words));
  if (stack) {
    new MutationObserver(schedule).observe(stack, {
      attributes: true,
      attributeFilter: ['data-paper-turned', 'data-paper-returned', 'data-paper-settled'],
    });
  }
  document.fonts?.addEventListener('loadingdone', schedule);

  layout(frame);
}
