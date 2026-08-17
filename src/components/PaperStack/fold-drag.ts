// Wires up the draggable "dog-ear" fold on each [data-paper-stack-root]'s front page, and
// registers the CSS custom properties (--fold-x, --fold-y, --fold-page-w, --fold-page-h,
// --fold-clip-inset, --page-index) the stack's styles (in index.astro) key off of.

type Vec = { x: number, y: number };

type FoldGesture = {
  pointerId: number;
  // Pointer minus tip at gesture start, in tip-local screen coordinates — rotates with the
  // fold as it's dragged, see the note on onFoldDrag
  offset: Vec;
  // atan2(fold-y, fold-x) at gesture start, needed to know how far that offset has rotated
  theta: number;
};

// Must match the "to" keyframe of initial-fold-reveal in index.astro
const FOLD_REVEAL_END = { x: '2cm', y: '1cm' };

const rotateVec = (v: Vec, angle: number): Vec => {
  const c = Math.cos(angle), s = Math.sin(angle);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
};

// .paper-fold's transform carries the box's local (0,0) corner (the visible, grabbable tip)
// away from its untransformed position, landing here instead (relative to the sheet's
// bottom-right corner; both fold-x and fold-y grow negative from there):
//   tipX = -2wh²/r²,  tipY = -2w²h/r²   (r² = w² + h²)
// The two only coincide on the w=h diagonal.
const foldTipFromSize = (w: number, h: number): Vec => {
  const r2 = w * w + h * h;
  if (r2 === 0) return { x: 0, y: 0 };
  return { x: -2 * w * h * h / r2, y: -2 * w * w * h / r2 };
};

// Closed-form inverse of foldTipFromSize, so tracking the pointer never depends on the previous
// frame's fold-x/-y (that recursion would otherwise make dragging jittery).
const foldSizeFromTip = (tx: number, ty: number): Vec => {
  const ntx = Math.min(tx, -0.01);
  const nty = Math.min(ty, -0.01);
  const d2 = ntx * ntx + nty * nty;
  return { x: -d2 / (2 * ntx), y: -d2 / (2 * nty) };
};

const clampNum = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

const readLength = (el: HTMLElement, name: string): number => parseFloat(getComputedStyle(el).getPropertyValue(name));

const currentFoldSize = (sheet: HTMLElement): Vec => ({ x: readLength(sheet, '--fold-x'), y: readLength(sheet, '--fold-y') });

// The crease is the line through (w-fold-x, h) and (w, h-fold-y), clipped to the page rectangle
// [0,w]x[0,h] — same two points index.astro's clip-path uses. Which edges it actually crosses
// depends on whether fold-x > w and/or fold-y > h; this closed form covers all four cases
// continuously (see index.astro's comment on --crease1-x for the derivation). Keeping the
// crease away from the clip point is capFoldSize's job, not this formula's.
const computeCrease = (w: number, h: number, fx: number, fy: number): { crease1: Vec, crease2: Vec } => {
  const excessX = Math.max(fx - w, 0);
  const excessY = Math.max(fy - h, 0);
  return {
    crease1: { x: Math.max(w - fx, 0), y: clampNum(h - fy * (excessX / fx), 0, h) },
    crease2: { x: clampNum(w - fx * (excessY / fy), 0, w), y: Math.max(h - fy, 0) },
  };
};

// Cap fold-x/fold-y so the crease can approach the clip point (c,c) — as if a paper clip were
// pinning the page there — but never cross it: given the drag's current ratio, this is the
// closed-form fold-x at which the crease line passes exactly through (c,c), derived from the
// crease's implicit line equation. Scales fold-x/fold-y down together (same direction) when
// exceeded, so it's a no-op whenever the target is already within bounds.
const capFoldSize = (w: number, h: number, fx: number, fy: number, c: number): Vec => {
  if (fx <= 0 || fy <= 0) return { x: fx, y: fy };
  const fxMax = (h - c) * (fx / fy) + (w - c);
  if (fx <= fxMax) return { x: fx, y: fy };
  const scale = fxMax / fx;
  return { x: fx * scale, y: fy * scale };
};

// The region folded away (a mirror image of which is what .paper-fold needs to show) — same
// crease points as the flat polygon in index.astro, going around the other way.
const holePolygon = (w: number, h: number, crease1: Vec, crease2: Vec): Vec[] => [
  { x: w, y: h },
  { x: w, y: 0 },
  crease2,
  crease1,
  { x: 0, y: h },
];

// Drives .paper-fold directly while dragging (and while settling back afterwards) instead of
// index.astro's idle CSS rule, which only fits a fold tightly sized to fold-x/fold-y — no longer
// enough once the crease can wrap around a corner. Clips the full-size flap to the hole polygon
// (always inside the paintable box) and folds it over with a reflection across the crease line
// itself: rotate(-θ) scaleY(-1) rotate(θ) about any point on the crease. (Not the idle rule's
// scaleX(-1) — that one reflects across the crease's perpendicular, which only lands right
// because the idle box-clip trick feeds it the opposite triangle.)
const updateActiveFlap = (fold: HTMLElement, w: number, h: number, fx: number, fy: number): void => {
  const { crease1, crease2 } = computeCrease(w, h, fx, fy);
  const hole = holePolygon(w, h, crease1, crease2);
  const theta = Math.atan2(fy, fx);
  // Midpoint of the crease line's two defining points (w-fx, h) and (w, h-fy)
  const origin = { x: w - fx / 2, y: h - fy / 2 };

  fold.style.clipPath = `polygon(${hole.map((p) => `${p.x}px ${p.y}px`).join(', ')})`;
  fold.style.transformOrigin = `${origin.x}px ${origin.y}px`;
  fold.style.transform = `rotate(${-theta}rad) scaleY(-1) rotate(${theta}rad)`;
};

const onFoldGrab = (sheet: HTMLElement, gesture: FoldGesture, e: PointerEvent) => {
  const { x: w, y: h } = currentFoldSize(sheet);
  const contentRect = sheet.getBoundingClientRect();
  const tip = foldTipFromSize(w, h);
  gesture.offset = { x: e.clientX - (contentRect.right + tip.x), y: e.clientY - (contentRect.bottom + tip.y) };
  gesture.theta = Math.atan2(h, w);
};

// T(θ), the fold's reflection transform, is self-inverse, and T(θ)·T(θ₀) works out to exactly
// R(2(θ₀-θ)) — a pure rotation. So a point grabbed slightly off the tip stays fixed relative to
// the fold's surface (rather than sliding off it as the fold's aspect ratio changes) if its
// screen-space offset from the tip is rotated by 2(θ₀-θ) as θ moves from its grab-time value θ₀.
// This frame's θ isn't known until after size is solved for below, so the last solved frame's θ
// is used instead — a one-frame lag, invisible at drag sampling rates.
const onFoldDrag = (sheet: HTMLElement, fold: HTMLElement, gesture: FoldGesture, e: PointerEvent, clipInset: number) => {
  // Idempotent — only the first move of a gesture actually needs this, but settleFold relies on
  // it having run at all (a grab that never moved leaves .paper-fold--active untouched, so it
  // knows there's nothing to hand back to the idle CSS rule).
  fold.classList.add('paper-fold--active');

  // Animations and transitions outrank inline styles in the cascade, so they have to be dropped
  // outright rather than paused — a paused animation still forces its own value
  sheet.style.transition = '';
  sheet.getAnimations().forEach((animation) => animation.cancel());

  const contentRect = sheet.getBoundingClientRect();
  const { x: wPrev, y: hPrev } = currentFoldSize(sheet);
  const offset = rotateVec(gesture.offset, 2 * (gesture.theta - Math.atan2(hPrev, wPrev)));

  const target = foldSizeFromTip(
    (e.clientX - offset.x) - contentRect.right,
    (e.clientY - offset.y) - contentRect.bottom,
  );

  const size = capFoldSize(contentRect.width, contentRect.height, target.x, target.y, clipInset);
  sheet.style.setProperty('--fold-x', `${size.x}px`);
  sheet.style.setProperty('--fold-y', `${size.y}px`);

  updateActiveFlap(fold, contentRect.width, contentRect.height, size.x, size.y);
};

const settleFold = (sheet: HTMLElement, fold: HTMLElement) => {
  // A grab that never dragged left the animations alone, so there is nothing to hand back
  if (sheet.style.getPropertyValue('--fold-x') === '') return;

  sheet.style.transition = '--fold-x 250ms ease-in-out, --fold-y 250ms ease-in-out';
  sheet.style.setProperty('--fold-x', FOLD_REVEAL_END.x);
  sheet.style.setProperty('--fold-y', FOLD_REVEAL_END.y);

  // The CSS transition above animates --fold-x/-y directly; keep .paper-fold in step with it
  // every frame until it finishes, then hand rendering back to index.astro's idle CSS rule.
  let frame = 0;
  const step = () => {
    const rect = sheet.getBoundingClientRect();
    const { x, y } = currentFoldSize(sheet);
    updateActiveFlap(fold, rect.width, rect.height, x, y);
    frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);

  const settling = sheet.getAnimations().filter((animation) => animation instanceof CSSTransition);
  Promise.all(settling.map((transition) => transition.finished)).then(() => {
    cancelAnimationFrame(frame);
    fold.classList.remove('paper-fold--active');
    fold.style.clipPath = '';
    fold.style.transform = '';
    fold.style.transformOrigin = '';

    sheet.style.transition = '';
    // The drag cancelled initial-fold-reveal, so its forwards-fill is gone for good — leaving
    // --fold-x/-y set here is what now holds FOLD_REVEAL_END during fold-reveal-pulse's own
    // delay. Only the pulse (2nd slot) gets a fresh run; the reveal (1st slot) stays retired,
    // since restarting it would replay its 0cm start and flash the fold back down.
    sheet.style.animationName = 'none, none';
    void sheet.offsetWidth;
    sheet.style.animationName = 'none, fold-reveal-pulse';
  }, () => {});
};

// Keeps --fold-page-w/-h in sync with the sheet's actual pixel size — the generalized clip-path
// formula in index.astro needs a real length to divide by (percentages aren't real lengths until
// layout, so they can't be used in that arithmetic).
const observeFoldPageSize = (sheet: HTMLElement): void => {
  const observer = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    sheet.style.setProperty('--fold-page-w', `${width}px`);
    sheet.style.setProperty('--fold-page-h', `${height}px`);
  });
  observer.observe(sheet);
};

const attachFoldDrag = (fold: HTMLElement) => {
  const sheet = fold.parentElement!;
  // Static — set once in CSS, never animated — so it's cheap to read once up front rather than
  // on every pointermove.
  const clipInset = readLength(sheet, '--fold-clip-inset');
  let gesture: FoldGesture | null = null;

  observeFoldPageSize(sheet);

  fold.addEventListener('pointerdown', (e) => {
    if (gesture !== null || e.button !== 0 || !e.isPrimary) return;
    e.preventDefault();
    e.stopPropagation();

    gesture = { pointerId: e.pointerId, offset: { x: 0, y: 0 }, theta: 0 };
    onFoldGrab(sheet, gesture, e);
    try {
      fold.setPointerCapture(e.pointerId);
    } catch {
      gesture = null;
      settleFold(sheet, fold);
    }
  });

  fold.addEventListener('pointermove', (e) => {
    if (gesture === null || e.pointerId !== gesture.pointerId) return;
    if (!fold.hasPointerCapture(e.pointerId)) return;
    if (e.buttons === 0) {
      fold.releasePointerCapture(e.pointerId);
      return;
    }
    onFoldDrag(sheet, fold, gesture, e, clipInset);
  });

  // Pointer capture is released — on pointerup *or* pointercancel — right before this fires, so
  // it's the one place that needs to settle the fold back to its resting size.
  fold.addEventListener('lostpointercapture', (e) => {
    if (gesture === null || e.pointerId !== gesture.pointerId) return;
    gesture = null;
    settleFold(sheet, fold);
  });
};

// Re-registering a name throws — harmless in production (each property is only ever declared
// once) but this guards against dev-time re-runs (e.g. Vite HMR re-executing this module).
const registerProperty = (definition: PropertyDefinition) => {
  try {
    CSS.registerProperty(definition);
  } catch {
    // already registered
  }
};

const registerFoldProperties = () => {
  for (const name of ['--fold-x', '--fold-y', '--fold-page-w', '--fold-page-h', '--fold-clip-inset']) {
    registerProperty({ name, syntax: '<length>', inherits: true, initialValue: '0px' });
  }
  registerProperty({ name: '--page-index', syntax: '<number>', inherits: true, initialValue: '1' });
};

export function initPaperStackFold(): void {
  const run = () => {
    registerFoldProperties();
    for (const stack of document.querySelectorAll<HTMLElement>('[data-paper-stack-root]')) {
      const fold = stack.children[0]?.querySelector<HTMLElement>('.paper-fold');
      if (fold) attachFoldDrag(fold);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
}
