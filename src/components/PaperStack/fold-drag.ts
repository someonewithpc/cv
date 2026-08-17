// Wires up the draggable "dog-ear" fold on each [data-paper-stack-root]'s front page — a drag
// released with the page's center folded over flips the page onto the back of the stack — and
// registers the CSS custom properties (--fold-x, --fold-y, --fold-back-x, --fold-back-y,
// --fold-page-w, --fold-page-h, --fold-clip-inset, --page-index) the stack's styles (in
// index.astro) key off of.

type Vec = { x: number, y: number };

type FoldGesture = {
  pointerId: number;
  // Pointer minus tip at gesture start, in tip-local screen coordinates — rotates with the
  // fold as it's dragged, see the note on onFoldDrag
  offset: Vec;
  // atan2(fold-y, fold-x) at gesture start, needed to know how far that offset has rotated
  theta: number;
  // Set when the drag gives up (pointer strayed past the grace margin) — the release then
  // always settles back rather than considering a flip.
  canceled: boolean;
};

// Must match the "to" keyframe of initial-fold-reveal in index.astro
const FOLD_REVEAL_END = { x: '2cm', y: '1cm' };
const PX_PER_CM = 96 / 2.54;
const FOLD_REVEAL_END_PX = { x: 2 * PX_PER_CM, y: 1 * PX_PER_CM };

// How far past the paper's reach (see the pin check in onFoldDrag) the pointer may stray while
// the fold holds at its limit, before the drag lets go entirely.
const FOLD_CANCEL_GRACE = 48;

// Outside a drag, a pointer within this range of the front page's top-left corner peels the
// back-fold corner up toward it — showcasing the drag-back-to-front gesture — growing the
// resting size by up to this factor.
const BACK_TEASE_RADIUS = 160;
const BACK_TEASE_GROWTH = 1.75;

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
// frame's fold-x/-y (that recursion would otherwise make dragging jittery). A tip below the
// bottom edge or right of the right edge yields a *negative* fold-y/-x — the crease's intercept
// slides past the corner, i.e. the fold hangs off that edge — so only the near-zero
// singularities need guarding, preserving sign continuity everywhere else.
const foldSizeFromTip = (tx: number, ty: number): Vec => {
  const ntx = Math.abs(tx) < 0.01 ? -0.01 : tx;
  const nty = Math.abs(ty) < 0.01 ? -0.01 : ty;
  const d2 = ntx * ntx + nty * nty;
  return { x: -d2 / (2 * ntx), y: -d2 / (2 * nty) };
};

const readLength = (el: HTMLElement, name: string): number => parseFloat(getComputedStyle(el).getPropertyValue(name));

const currentFoldSize = (sheet: HTMLElement): Vec => ({ x: readLength(sheet, '--fold-x'), y: readLength(sheet, '--fold-y') });

const currentBackFoldSize = (sheet: HTMLElement): Vec => ({ x: readLength(sheet, '--fold-back-x'), y: readLength(sheet, '--fold-back-y') });

// The page content — the sibling whose clip-path cuts the holes (the flaps, clip, and hint ride
// above that cut, see index.astro).
const sectionOf = (sheet: HTMLElement): HTMLElement =>
  sheet.querySelector<HTMLElement>(':scope > :not(.paper-fold, .paper-fold-back, .paper-clip, .paper-flip-hint)')!;

// The flaps paint the back of the sheet in the page's own color, but as siblings of the page
// content they can't see background definitions scoped inside it (e.g. a blueprint page
// redefining its surface variable), so the resolved color is lifted onto the sheet for them.
const syncPaperSurface = (sheet: HTMLElement, section: HTMLElement): void => {
  sheet.style.setProperty('--paper-surface', getComputedStyle(section).backgroundColor);
};

// The crease is the perpendicular bisector between the page corner (w, h) and the dragged tip
// (given relative to that corner) — the unique line folding one onto the other. Splitting the
// page rectangle against it (single-edge Sutherland-Hodgman, both sides in one pass) covers
// every fold the tip can express, including creases that wrap page corners or hang off the
// bottom/right edges, without the closed-form case analysis the idle CSS formula needs.
const splitByCrease = (w: number, h: number, tip: Vec, back: Vec) => {
  const length = Math.hypot(tip.x, tip.y);
  const normal = { x: tip.x / length, y: tip.y / length };
  const mid = { x: w + tip.x / 2, y: h + tip.y / 2 };
  const signed = (p: Vec) => (p.x - mid.x) * normal.x + (p.y - mid.y) * normal.y;

  // The page rectangle minus the back-fold's top-left corner cut (both cut vertices collapse to
  // (0, 0) while the back-fold is 0, i.e. before any page has been flipped)
  const rect = [{ x: back.x, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }, { x: 0, y: back.y }];
  const kept: Vec[] = [];
  const hole: Vec[] = [];
  for (let i = 0; i < rect.length; i++) {
    const cur = rect[i], next = rect[(i + 1) % rect.length];
    const sCur = signed(cur), sNext = signed(next);
    if (sCur >= 0) kept.push(cur);
    if (sCur <= 0) hole.push(cur);
    if ((sCur < 0) !== (sNext < 0) && sCur !== 0 && sNext !== 0) {
      const t = sCur / (sCur - sNext);
      const crossing = { x: cur.x + t * (next.x - cur.x), y: cur.y + t * (next.y - cur.y) };
      kept.push(crossing);
      hole.push(crossing);
    }
  }
  return { kept, hole, mid, angle: Math.atan2(normal.x, -normal.y) };
};

// Whether the crease has folded the page's center over with the corner — the folded region is
// the corner's side of the crease, so this is the same signed-side convention as splitByCrease,
// negative meaning folded. Used both as live drag feedback and as the release's flip threshold.
const centerFolded = (w: number, h: number, tip: Vec): boolean => {
  if (Math.hypot(tip.x, tip.y) < 0.5) return false;
  const mid = { x: w + tip.x / 2, y: h + tip.y / 2 };
  return (w / 2 - mid.x) * tip.x + (h / 2 - mid.y) * tip.y < 0;
};

// Drives the page's clip-path and .paper-fold directly while dragging (and while settling back
// afterwards) instead of index.astro's idle CSS rules, which only fit the simple
// bottom-and-right-edge crease. The flap clips to the hole polygon (always inside its paintable
// box) and folds over with a reflection across the crease line: rotate(α) scaleY(-1) rotate(-α)
// about any point on the crease, α being the crease's direction angle. (Not the idle rule's
// scaleX(-1) — that one reflects across the crease's perpendicular, which only lands right
// because the idle box-clip trick feeds it the opposite triangle.)
const renderFold = (section: HTMLElement, fold: HTMLElement, w: number, h: number, tip: Vec, back: Vec): void => {
  const poly = (pts: Vec[]) => `polygon(${pts.map((p) => `${p.x}px ${p.y}px`).join(', ')})`;
  const degenerate = Math.hypot(tip.x, tip.y) < 0.5;
  const { kept, hole, mid, angle } = degenerate
    ? { kept: [], hole: [], mid: { x: 0, y: 0 }, angle: 0 }
    : splitByCrease(w, h, tip, back);

  if (degenerate || hole.length < 3) {
    // Degenerate fold (tip at the corner, or crease off the page) — page whole, flap hidden
    section.style.clipPath = '';
    fold.style.clipPath = 'polygon(0px 0px, 0px 0px, 0px 0px)';
    return;
  }

  section.style.clipPath = poly(kept);
  fold.style.clipPath = poly(hole);
  fold.style.transformOrigin = `${mid.x}px ${mid.y}px`;
  fold.style.transform = `rotate(${angle}rad) scaleY(-1) rotate(${-angle}rad)`;
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
const onFoldDrag = (sheet: HTMLElement, section: HTMLElement, fold: HTMLElement, gesture: FoldGesture, e: PointerEvent, clipInset: number) => {
  // Idempotent — only the first move of a gesture actually needs this, but settleFold relies on
  // it having run at all (a grab that never moved leaves .paper-fold--active untouched, so it
  // knows there's nothing to hand back to the idle CSS rule).
  fold.classList.add('paper-fold--active');

  // Animations outrank inline styles in the cascade, so they have to be dropped outright rather
  // than paused — a paused animation still forces its own value
  sheet.getAnimations().forEach((animation) => animation.cancel());

  const contentRect = sheet.getBoundingClientRect();
  const { x: wPrev, y: hPrev } = currentFoldSize(sheet);
  const offset = rotateVec(gesture.offset, 2 * (gesture.theta - Math.atan2(hPrev, wPrev)));

  let tip = {
    x: (e.clientX - offset.x) - contentRect.right,
    y: (e.clientY - offset.y) - contentRect.bottom,
  };

  // Paper doesn't stretch: folding keeps the dragged corner within |corner - pin| of the paper
  // clip's pin (folding preserves the corner's distance to every point on the crease, and the
  // crease can at most pass through the pin). Slightly past that rim the fold holds there — the
  // crease pivoting around the pin as the pointer arcs — and past the grace margin the drag
  // gives up and lets the fold settle.
  const pin = { x: clipInset - contentRect.width, y: clipInset - contentRect.height };
  const reach = Math.hypot(pin.x, pin.y);
  const fromPin = { x: tip.x - pin.x, y: tip.y - pin.y };
  const overshoot = Math.hypot(fromPin.x, fromPin.y) - reach;
  if (overshoot > FOLD_CANCEL_GRACE) {
    gesture.canceled = true;
    fold.releasePointerCapture(e.pointerId);
    return;
  }
  if (overshoot > 0) {
    const scale = reach / (reach + overshoot);
    tip = { x: pin.x + fromPin.x * scale, y: pin.y + fromPin.y * scale };
  }

  const size = foldSizeFromTip(tip.x, tip.y);
  sheet.style.setProperty('--fold-x', `${size.x}px`);
  sheet.style.setProperty('--fold-y', `${size.y}px`);

  // Live flip-commit feedback: past the center-folded threshold (see releaseFold) the flap
  // brightens and the flip hint appears
  const willFlip = sheet.parentElement!.childElementCount > 1
    && centerFolded(contentRect.width, contentRect.height, tip);
  fold.classList.toggle('paper-fold--will-flip', willFlip);

  renderFold(section, fold, contentRect.width, contentRect.height, tip, currentBackFoldSize(sheet));
};

// Glides the fold's tip to a target along a straight tip-space path, easing out like released
// tension, over a duration scaled to how far the tip has to travel — a long glide takes visibly
// longer than a small nudge. Runs on its own rAF clock (rather than a CSS transition on
// --fold-x/-y) so the path is the tip's, not the crease intercepts' — those diverge wildly for
// large folds — and returns a cancel handle so a re-grab mid-glide can take over cleanly.
const glideFoldTip = (
  sheet: HTMLElement, section: HTMLElement, fold: HTMLElement,
  to: Vec, baseMs: number, onDone: () => void,
): (() => void) => {
  const { width, height } = sheet.getBoundingClientRect();
  const { x: fx, y: fy } = currentFoldSize(sheet);
  const back = currentBackFoldSize(sheet);
  const from = foldTipFromSize(fx, fy);
  const distance = Math.hypot(from.x - to.x, from.y - to.y);
  const duration = Math.min(baseMs + distance / 3, baseMs + 500);

  let frame = 0;
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - (1 - t) ** 3;
    const tip = { x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased };
    const size = foldSizeFromTip(tip.x, tip.y);
    sheet.style.setProperty('--fold-x', `${size.x}px`);
    sheet.style.setProperty('--fold-y', `${size.y}px`);
    renderFold(section, fold, width, height, tip, back);

    if (t < 1) {
      frame = requestAnimationFrame(step);
      return;
    }
    onDone();
  };
  frame = requestAnimationFrame(step);

  return () => cancelAnimationFrame(frame);
};

// Glides back to the resting dog-ear, then hands rendering back to index.astro's idle CSS rules
const settleFold = (sheet: HTMLElement, section: HTMLElement, fold: HTMLElement): (() => void) => {
  // Settling means no flip is coming, so the commit feedback drops immediately
  fold.classList.remove('paper-fold--will-flip');
  return glideFoldTip(sheet, section, fold, foldTipFromSize(FOLD_REVEAL_END_PX.x, FOLD_REVEAL_END_PX.y), 1000, () => {
    fold.classList.remove('paper-fold--active');
    section.style.clipPath = '';
    fold.style.clipPath = '';
    fold.style.transform = '';
    fold.style.transformOrigin = '';

    sheet.style.setProperty('--fold-x', FOLD_REVEAL_END.x);
    sheet.style.setProperty('--fold-y', FOLD_REVEAL_END.y);
    // The drag cancelled initial-fold-reveal, so its forwards-fill is gone for good — leaving
    // --fold-x/-y set here is what now holds FOLD_REVEAL_END during fold-reveal-pulse's own
    // delay. Only the pulse (2nd slot) gets a fresh run; the reveal (1st slot) stays retired,
    // since restarting it would replay its 0cm start and flash the fold back down.
    sheet.style.animationName = 'none, none';
    void sheet.offsetWidth;
    sheet.style.animationName = 'none, fold-reveal-pulse';
  });
};

// Moves the front page to the back of the stack: every page's --page-index shifts down one (the
// splay rotation and paint order both follow it, with the rotate transition re-splaying the
// pages around the shared pin), and the paper-front class plus the fold and clip elements move
// to the new front page — handing the class over restarts its fold-reveal animations. The
// flipped page's inline fold state is fully cleared so its next turn at the front starts fresh.
const sendToBack = (sheet: HTMLElement, section: HTMLElement, fold: HTMLElement): void => {
  const stack = sheet.parentElement!;
  const pages = [...stack.children] as HTMLElement[];
  const back = sheet.querySelector<HTMLElement>('.paper-fold-back')!;
  const clip = sheet.querySelector<HTMLElement>('.paper-clip')!;
  const hint = sheet.querySelector<HTMLElement>('.paper-flip-hint')!;

  fold.classList.remove('paper-fold--active', 'paper-fold--will-flip');
  section.style.clipPath = '';
  fold.style.clipPath = '';
  fold.style.transform = '';
  fold.style.transformOrigin = '';
  sheet.style.removeProperty('--fold-x');
  sheet.style.removeProperty('--fold-y');
  sheet.style.removeProperty('--paper-surface');
  sheet.style.animationName = '';

  const pageIndex = (page: HTMLElement) => parseFloat(page.style.getPropertyValue('--page-index'));
  const next = pages.find((page) => pageIndex(page) === 2)!;
  for (const page of pages) {
    const index = pageIndex(page);
    page.style.setProperty('--page-index', `${index === 1 ? pages.length : index - 1}`);
  }
  sheet.classList.remove('paper-front');
  next.classList.add('paper-front');
  next.append(back, clip, fold, hint);
  stack.dataset.paperFlipped = '';
  syncPaperSurface(next, sectionOf(next));
};

// A committed flip: glide the tip the rest of the way to the far side of the pin's reach circle
// (the fullest fold a pinned sheet can make — 2·pin is the rim point farthest from the corner),
// then send the page to the back of the stack.
const flipFold = (sheet: HTMLElement, section: HTMLElement, fold: HTMLElement, clipInset: number): (() => void) => {
  const { width, height } = sheet.getBoundingClientRect();
  const pin = { x: clipInset - width, y: clipInset - height };
  return glideFoldTip(sheet, section, fold, { x: 2 * pin.x, y: 2 * pin.y }, 300, () => sendToBack(sheet, section, fold));
};

const shouldFlip = (sheet: HTMLElement): boolean => {
  const { width, height } = sheet.getBoundingClientRect();
  const { x: fx, y: fy } = currentFoldSize(sheet);
  return centerFolded(width, height, foldTipFromSize(fx, fy));
};

const releaseFold = (sheet: HTMLElement, section: HTMLElement, fold: HTMLElement, clipInset: number, canceled: boolean): (() => void) => {
  // A grab that never dragged left the animations alone, so there is nothing to hand back
  if (sheet.style.getPropertyValue('--fold-x') === '') return () => {};

  const hasBack = sheet.parentElement!.childElementCount > 1;
  if (!canceled && hasBack && shouldFlip(sheet)) return flipFold(sheet, section, fold, clipInset);
  return settleFold(sheet, section, fold);
};

// Keeps --fold-page-w/-h in sync with each page's actual pixel size — the generalized clip-path
// formula in index.astro needs a real length to divide by (percentages aren't real lengths until
// layout, so they can't be used in that arithmetic). Every page is observed, not just the
// current front, since flips move the front-page role around.
const observeFoldPageSizes = (stack: HTMLElement): void => {
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      (entry.target as HTMLElement).style.setProperty('--fold-page-w', `${width}px`);
      (entry.target as HTMLElement).style.setProperty('--fold-page-h', `${height}px`);
    }
  });
  for (const page of stack.children) observer.observe(page);
};

// Outside a drag, approaching the front page's top-left corner grows the back-fold corner
// toward the pointer, teasing the drag-back gesture. Inline sizes override the CSS resting
// values; clearing them lets the sheet's transition ease the corner back down.
const attachBackFoldTease = (stack: HTMLElement, isDragging: () => boolean) => {
  const clearTease = () => {
    const front = stack.querySelector<HTMLElement>('.paper-front');
    front?.style.removeProperty('--fold-back-x');
    front?.style.removeProperty('--fold-back-y');
  };

  stack.addEventListener('pointermove', (e) => {
    if (!('paperFlipped' in stack.dataset) || isDragging()) return;
    const front = stack.querySelector<HTMLElement>('.paper-front')!;
    const corner = front.getBoundingClientRect();
    const distance = Math.hypot(e.clientX - corner.left, e.clientY - corner.top);
    if (distance >= BACK_TEASE_RADIUS) {
      clearTease();
      return;
    }
    const grow = 1 + (BACK_TEASE_GROWTH - 1) * (1 - distance / BACK_TEASE_RADIUS);
    front.style.setProperty('--fold-back-x', `${FOLD_REVEAL_END_PX.x * grow}px`);
    front.style.setProperty('--fold-back-y', `${FOLD_REVEAL_END_PX.y * grow}px`);
  });
  stack.addEventListener('pointerleave', clearTease);

  return clearTease;
};

const attachFoldDrag = (fold: HTMLElement) => {
  // Re-derived on every grab: a completed flip moves the fold (and its companion elements) onto
  // the new front page, so the sheet and section they ride on change over time.
  let sheet = fold.parentElement!;
  let section = sectionOf(sheet);
  let clipInset = readLength(sheet, '--fold-clip-inset');
  let gesture: FoldGesture | null = null;
  let cancelSettle: () => void = () => {};

  syncPaperSurface(sheet, section);
  const clearTease = attachBackFoldTease(sheet.parentElement!, () => gesture !== null);

  fold.addEventListener('pointerdown', (e) => {
    if (gesture !== null || e.button !== 0 || !e.isPrimary) return;
    e.preventDefault();
    e.stopPropagation();

    sheet = fold.parentElement!;
    section = sectionOf(sheet);
    clipInset = readLength(sheet, '--fold-clip-inset');
    syncPaperSurface(sheet, section);
    clearTease();

    // Grabbing mid-settle freezes the fold where it is and takes over from there
    cancelSettle();
    gesture = { pointerId: e.pointerId, offset: { x: 0, y: 0 }, theta: 0, canceled: false };
    onFoldGrab(sheet, gesture, e);
    try {
      fold.setPointerCapture(e.pointerId);
    } catch {
      gesture = null;
      cancelSettle = releaseFold(sheet, section, fold, clipInset, true);
    }
  });

  fold.addEventListener('pointermove', (e) => {
    if (gesture === null || e.pointerId !== gesture.pointerId) return;
    if (!fold.hasPointerCapture(e.pointerId)) return;
    if (e.buttons === 0) {
      fold.releasePointerCapture(e.pointerId);
      return;
    }
    onFoldDrag(sheet, section, fold, gesture, e, clipInset);
  });

  // Pointer capture is released — on pointerup *or* pointercancel — right before this fires, so
  // it's the one place that decides what the released fold does: flip onto the back of the
  // stack, or settle back to its resting size.
  fold.addEventListener('lostpointercapture', (e) => {
    if (gesture === null || e.pointerId !== gesture.pointerId) return;
    const { canceled } = gesture;
    gesture = null;
    cancelSettle = releaseFold(sheet, section, fold, clipInset, canceled);
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
  for (const name of ['--fold-x', '--fold-y', '--fold-back-x', '--fold-back-y', '--fold-page-w', '--fold-page-h', '--fold-clip-inset']) {
    registerProperty({ name, syntax: '<length>', inherits: true, initialValue: '0px' });
  }
  registerProperty({ name: '--page-index', syntax: '<number>', inherits: true, initialValue: '1' });
};

export function initPaperStackFold(): void {
  const run = () => {
    registerFoldProperties();
    for (const stack of document.querySelectorAll<HTMLElement>('[data-paper-stack-root]')) {
      const fold = stack.querySelector<HTMLElement>('.paper-fold');
      if (!fold) continue;
      observeFoldPageSizes(stack);
      attachFoldDrag(fold);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
}
