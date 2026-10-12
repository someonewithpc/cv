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
 * size, which covers the viewport and the font arriving, and when a turned page settles.
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

/** The frame each observed stack or line of words belongs to. */
const frameOf = new WeakMap<Element, HTMLElement>();

/**
 * One observer for every frame, created as the module loads: the browser delivers resize
 * observations in the order the observers were created, and this one then comes right after
 * the annotation overlay's, before any observer that writes (Stack.astro's measure, the fold's
 * page sizes). Style and layout are clean at that point, so the rects layout() reads cost no
 * flush. Read from a frame callback instead, they came after the overlay's writes and forced
 * one on every resize step.
 */
const sized = new ResizeObserver((entries) => {
  const touched = new Set<HTMLElement>();
  for (const entry of entries) {
    const frame = frameOf.get(entry.target);
    if (frame) touched.add(frame);
  }
  for (const frame of touched) layout(frame);
});

/**
 * The four resting intercepts in pixels, off the spans Stack.astro sizes to them. A probe
 * inserted per reading put the whole page back through style and layout four times a step.
 */
function creaseLengths(layer: HTMLElement) {
  return ['rest-x', 'rest-y', 'lean-x', 'lean-y'].map((name) =>
    layer.querySelector(`.crease-length[data-length='${name}']`)?.getBoundingClientRect().width ?? 0);
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
  // The layer is shown by the frame's mark (Stack.astro), so the mark is asked rather than the
  // layer's computed display, which would resolve style on the spot.
  if (!layer || !stack || !frame.hasAttribute('data-hint-show')) return;

  const box = layer.getBoundingClientRect();
  const sheet = stack.getBoundingClientRect();
  const [restX, restY, leanX, leanY] = creaseLengths(layer);
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
  if (!layer.hasAttribute('data-hint-drawn')) layer.setAttribute('data-hint-drawn', '');
  for (const { way, svg, words } of measured) draw(svg, box, words, creases[way], way);
}

/**
 * Marks the frame the first time its peel hint has come up past the quarter mark of the
 * viewport, which is what the stylesheet waits for before typing the line out. The words are
 * the thing that has to be watched rather than the frame: they are written below the frame's
 * bottom edge, so a frame a quarter in view still has its hint off the bottom of the screen,
 * and the line would have typed itself out before the reader got to it. The mark is set once
 * and the watch ends there, so coming back to it later finds it written, not writing.
 */
function markWhenSeen(frame: HTMLElement) {
  const words = frame.querySelector<HTMLElement>('.flip-hint--fwd.hint-words');
  if (!words) return;

  const seen = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    frame.setAttribute('data-hint-seen', '');
    seen.disconnect();
  }, { rootMargin: '0px 0px -25%' });
  seen.observe(words);
}

/**
 * Lays the frame's hint arrows out whenever their ends move. The first layout comes from the
 * observer's first report, in the first frame and before its paint, where the rects are already
 * worked out. Laid out here, before DOMContentLoaded, it forced the first style and layout of the
 * whole document on the spot.
 */
export function drawFlipHints(frame: HTMLElement) {
  if (frames.has(frame)) { frames.get(frame)!(); return; }

  let queued = 0;
  const schedule = () => {
    if (queued) return;
    queued = requestAnimationFrame(() => { queued = 0; layout(frame); });
  };
  frames.set(frame, schedule);

  const stack = frame.querySelector<HTMLElement>('article.technical-drawing-stack');
  for (const el of [stack, ...frame.querySelectorAll<HTMLElement>('.flip-hints .hint-words')]) {
    if (!el) continue;
    frameOf.set(el, frame);
    sized.observe(el);
  }
  if (stack) {
    // Neither callout is on screen while a page is moving: the peel hint goes the moment the
    // stack is marked as turned, and the way back waits for the settle. So the measure waits for
    // the settle too. Taken at the turn, it fell in the frame right after the stack renumbers
    // its pages, and cost a sixth of a second there for a drawing nothing could see yet.
    new MutationObserver(() => {
      if (stack.hasAttribute('data-paper-settled')) schedule();
    }).observe(stack, { attributes: true, attributeFilter: ['data-paper-settled'] });
  }
  document.fonts?.addEventListener('loadingdone', schedule);
  markWhenSeen(frame);
}
