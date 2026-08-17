// Wires up the draggable "dog-ear" fold on each [data-paper-stack-root]'s front page, and
// registers the CSS custom properties (--fold-x, --fold-y, --page-index) the stack's styles
// (in index.astro) key off of.

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

// .paper-fold's transform is rotate(-θ) scaleX(-1) rotate(θ), θ = atan2(h, w) — a reflection,
// not a rotation. It carries the box's local (0,0) corner (the visible, grabbable tip) away
// from its untransformed position, landing here instead (relative to the sheet's bottom-right
// corner; both fold-x and fold-y grow negative from there):
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

const currentFoldSize = (sheet: HTMLElement): Vec => {
  const style = getComputedStyle(sheet);
  return { x: parseFloat(style.getPropertyValue('--fold-x')), y: parseFloat(style.getPropertyValue('--fold-y')) };
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
const onFoldDrag = (sheet: HTMLElement, gesture: FoldGesture, e: PointerEvent) => {
  // Animations and transitions outrank inline styles in the cascade, so they have to be dropped
  // outright rather than paused — a paused animation still forces its own value
  sheet.style.transition = '';
  sheet.getAnimations().forEach((animation) => animation.cancel());

  const contentRect = sheet.getBoundingClientRect();
  const { x: wPrev, y: hPrev } = currentFoldSize(sheet);
  const offset = rotateVec(gesture.offset, 2 * (gesture.theta - Math.atan2(hPrev, wPrev)));

  const size = foldSizeFromTip(
    (e.clientX - offset.x) - contentRect.right,
    (e.clientY - offset.y) - contentRect.bottom,
  );
  sheet.style.setProperty('--fold-x', `${size.x}px`);
  sheet.style.setProperty('--fold-y', `${size.y}px`);
};

const settleFold = (sheet: HTMLElement) => {
  // A grab that never dragged left the animations alone, so there is nothing to hand back
  if (sheet.style.getPropertyValue('--fold-x') === '') return;

  sheet.style.transition = '--fold-x 250ms ease-in-out, --fold-y 250ms ease-in-out';
  sheet.style.setProperty('--fold-x', FOLD_REVEAL_END.x);
  sheet.style.setProperty('--fold-y', FOLD_REVEAL_END.y);

  const settling = sheet.getAnimations().filter((animation) => animation instanceof CSSTransition);
  Promise.all(settling.map((transition) => transition.finished)).then(() => {
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

const attachFoldDrag = (fold: HTMLElement) => {
  const sheet = fold.parentElement!;
  let gesture: FoldGesture | null = null;

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
      settleFold(sheet);
    }
  });

  fold.addEventListener('pointermove', (e) => {
    if (gesture === null || e.pointerId !== gesture.pointerId) return;
    if (!fold.hasPointerCapture(e.pointerId)) return;
    if (e.buttons === 0) {
      fold.releasePointerCapture(e.pointerId);
      return;
    }
    onFoldDrag(sheet, gesture, e);
  });

  // Pointer capture is released — on pointerup *or* pointercancel — right before this fires, so
  // it's the one place that needs to settle the fold back to its resting size.
  fold.addEventListener('lostpointercapture', (e) => {
    if (gesture === null || e.pointerId !== gesture.pointerId) return;
    gesture = null;
    settleFold(sheet);
  });
};

const registerFoldProperties = () => {
  for (const name of ['--fold-x', '--fold-y']) {
    CSS.registerProperty({ name, syntax: '<length>', inherits: true, initialValue: '0px' });
  }
  CSS.registerProperty({ name: '--page-index', syntax: '<number>', inherits: true, initialValue: '1' });
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
