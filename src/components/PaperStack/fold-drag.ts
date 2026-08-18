// Wires up the draggable "dog-ear" fold on each [data-paper-stack-root]'s front page — a drag
// released with the page's center folded over flips the page onto the back of the stack, and
// grabbing the folded-back top-left corner runs the same gesture in reverse to bring the
// previous page back — and registers the CSS custom properties (--fold-x, --fold-y,
// --fold-back-x, --fold-back-y, --fold-back-rest-x, --fold-back-rest-y, --fold-pin-x,
// --fold-pin-y, --fold-page-w, --fold-page-h, --page-index, --flip-progress) the stack's
// styles (in index.astro) key off of.

type Vec = { x: number, y: number };

type FoldGesture = {
  pointerId: number;
  // Scaled pointer minus tip at gesture start, in tip-local screen coordinates — rotates with
  // the fold as it's dragged when the tip itself is grabbed, see the note on onFoldDrag
  offset: Vec;
  // atan2(fold-y, fold-x) at gesture start, needed to know how far that offset has rotated
  theta: number;
  // Pointer-to-tip amplification. 1 when the tip corner itself is grabbed (the forward fold);
  // 2 when the folded-back crease corner is (the back gesture) — moving a crease by d moves
  // the corner reflected across it by 2d, so this is what keeps that drag feeling physical.
  gain: number;
  // Set when the drag gives up (pointer strayed past the grace margin) — the release then
  // always settles back rather than considering a flip.
  canceled: boolean;
  // Present while a back-drag is still in its approach phase — the previous page folding up
  // behind the stack, before it has come over the clip (see onBackApproach). Cleared when the
  // approach completes and the page is promoted.
  approach: {
    // The fully-folded tip: the page corner reflected across the resting crease
    seed: Vec;
    // Pointer position at grab, and the pull direction (the resting crease's normal)
    origin: Vec;
    dir: Vec;
    // The sheet's computed splay (plus any tease peek) at grab, unwound as the page comes over
    startRotate: number;
  } | null;
};

// Must match the "to" keyframe of initial-fold-reveal in index.astro
const FOLD_REVEAL_END = { x: '2cm', y: '1cm' };
const PX_PER_CM = 96 / 2.54;
const FOLD_REVEAL_END_PX = { x: 2 * PX_PER_CM, y: 1 * PX_PER_CM };

// How far past the paper's reach (see the pin check in onFoldDrag) the pointer may stray while
// the fold holds at its limit, before the drag lets go entirely.
const FOLD_CANCEL_GRACE = 48;

// Outside a drag, a pointer within BACK_TEASE_RADIUS of the front page's top-left corner
// rotates the hindmost page out from behind the stack — up to BACK_TEASE_PEEK degrees right at
// the corner — showing the page waiting back there to be dragged over.
const BACK_TEASE_RADIUS = 160;
const BACK_TEASE_PEEK = 5;

// Pointer travel, projected along the pull direction (the resting crease's normal), that folds
// the previous page fully over the clip during a back-drag's approach phase.
const BACK_APPROACH_DISTANCE = 220;

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

// The folded-back corner's resting crease intercepts (the wire's outer-right edge runs along
// that crease — see index.astro).
const backRestSize = (el: HTMLElement): Vec => ({ x: readLength(el, '--fold-back-rest-x'), y: readLength(el, '--fold-back-rest-y') });

// The paper clip's pin — the bottom end of the wire's outer-right edge, sitting on the resting
// crease — in tip coordinates (relative to the page's bottom-right corner).
const pinOf = (el: HTMLElement, width: number, height: number): Vec => ({
  x: readLength(el, '--fold-pin-x') - width,
  y: readLength(el, '--fold-pin-y') - height,
});

// The page content — the sibling whose clip-path cuts the holes (the flap, clip, grab handle,
// and hint ride above that cut, see index.astro).
const sectionOf = (sheet: HTMLElement): HTMLElement =>
  sheet.querySelector<HTMLElement>(':scope > :not(.paper-fold, .paper-back-grab, .paper-clip, .paper-clip-under, .paper-flip-hint)')!;

// The flap paints the back of the sheet in the page's own color, but as a sibling of the page
// content it can't see background definitions scoped inside it (e.g. a blueprint page
// redefining its surface variable), so the resolved color is lifted onto the sheet for it.
const syncPaperSurface = (sheet: HTMLElement, section: HTMLElement): void => {
  sheet.style.setProperty('--paper-surface', getComputedStyle(section).backgroundColor);
};

const polygonCentroid = (pts: Vec[]): Vec => {
  let doubleArea = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const cross = a.x * b.y - b.x * a.y;
    doubleArea += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  if (doubleArea === 0) return pts[0];
  return { x: cx / (3 * doubleArea), y: cy / (3 * doubleArea) };
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

// How far along the flip the fold is, 0..1 — the same signed center-to-crease distance
// centerFolded thresholds, normalized between the resting dog-ear (0) and the crease reaching
// the page's center (1). That upper end is exactly where releasing starts flipping the page, so
// the splay this drives (--flip-progress on the stack, see index.astro) has already brought the
// next page round to horizontal by the time the drop is on offer — rather than only settling
// there once the flip animation has run and renumbered the stack. Folding deeper than that just
// holds at 1.
const flipProgress = (w: number, h: number, tip: Vec): number => {
  const centerDist = (t: Vec): number => {
    const len = Math.hypot(t.x, t.y);
    const mid = { x: w + t.x / 2, y: h + t.y / 2 };
    return ((w / 2 - mid.x) * t.x + (h / 2 - mid.y) * t.y) / len;
  };
  if (Math.hypot(tip.x, tip.y) < 0.5) return 0;
  const rest = centerDist(foldTipFromSize(FOLD_REVEAL_END_PX.x, FOLD_REVEAL_END_PX.y));
  return Math.min(Math.max(1 - centerDist(tip) / rest, 0), 1);
};

const setFlipProgress = (sheet: HTMLElement, w: number, h: number, tip: Vec): void => {
  sheet.parentElement!.style.setProperty('--flip-progress', `${flipProgress(w, h, tip)}`);
};

// Hands the page and its flap back to index.astro's own rules, dropping everything renderFold
// drives inline.
const clearFoldRender = (section: HTMLElement, fold: HTMLElement): void => {
  section.style.clipPath = '';
  section.style.transform = '';
  section.style.transformOrigin = '';
  fold.style.clipPath = '';
  fold.style.transform = '';
  fold.style.transformOrigin = '';
};

// Drives the page's clip-path and .paper-fold directly while dragging (and while settling back
// afterwards) instead of index.astro's idle CSS rules, which only fit the simple
// bottom-and-right-edge crease. The folded-over region is the hole polygon pushed through a
// reflection across the crease line: rotate(α) scaleY(-1) rotate(-α) about any point on the
// crease, α being the crease's direction angle. (Not the idle rule's scaleX(-1) — that one
// reflects across the crease's perpendicular, which only lands right because the idle box-clip
// trick feeds it the opposite triangle.)
//
// Which element takes that reflection is what decides the face on show. Normally it's the flap,
// painting the sheet's blank back over a page lying face-up. Past the clip (frontOut) the sheet
// lies face-down behind the stack, so folding it over brings its printed side up: the page's own
// content takes the reflection and the flap sits out. See flipFold and onBackApproach.
const renderFold = (
  section: HTMLElement, fold: HTMLElement, w: number, h: number, tip: Vec, back: Vec,
  frontOut = false,
): void => {
  const poly = (pts: Vec[]) => `polygon(${pts.map((p) => `${p.x}px ${p.y}px`).join(', ')})`;
  const degenerate = Math.hypot(tip.x, tip.y) < 0.5;
  const { kept, hole, mid, angle } = degenerate
    ? { kept: [], hole: [], mid: { x: 0, y: 0 }, angle: 0 }
    : splitByCrease(w, h, tip, back);

  if (degenerate || hole.length < 3) {
    // Degenerate fold (tip at the corner, or crease off the page) — page whole, flap hidden
    section.style.clipPath = '';
    section.style.transform = '';
    section.style.transformOrigin = '';
    fold.style.clipPath = 'polygon(0px 0px, 0px 0px, 0px 0px)';
    return;
  }

  const reflect = `rotate(${angle}rad) scaleY(-1) rotate(${-angle}rad)`;
  const origin = `${mid.x}px ${mid.y}px`;
  if (frontOut) {
    section.style.clipPath = poly(hole);
    section.style.transformOrigin = origin;
    section.style.transform = reflect;
    fold.style.clipPath = 'polygon(0px 0px, 0px 0px, 0px 0px)';
  } else {
    section.style.clipPath = poly(kept);
    section.style.transform = '';
    section.style.transformOrigin = '';
    fold.style.clipPath = poly(hole);
    fold.style.transformOrigin = origin;
    fold.style.transform = reflect;
  }

  // The flip hint rides at the flap's visual center: the hole's centroid pushed through the
  // same reflection the flap paints with. It's a sheet sibling of the flap, not a child, so it
  // stays unmirrored.
  const hint = fold.parentElement!.querySelector<HTMLElement>(':scope > .paper-flip-hint');
  if (hint) {
    const centroid = polygonCentroid(hole);
    const local = rotateVec({ x: centroid.x - mid.x, y: centroid.y - mid.y }, -angle);
    const reflected = rotateVec({ x: local.x, y: -local.y }, angle);
    hint.style.left = `${mid.x + reflected.x}px`;
    hint.style.top = `${mid.y + reflected.y}px`;
  }
};

const onFoldGrab = (sheet: HTMLElement, gesture: FoldGesture, e: PointerEvent) => {
  const { x: w, y: h } = currentFoldSize(sheet);
  const contentRect = sheet.getBoundingClientRect();
  const tip = foldTipFromSize(w, h);
  gesture.offset = {
    x: gesture.gain * e.clientX - (contentRect.right + tip.x),
    y: gesture.gain * e.clientY - (contentRect.bottom + tip.y),
  };
  gesture.theta = Math.atan2(h, w);
};

// T(θ), the fold's reflection transform, is self-inverse, and T(θ)·T(θ₀) works out to exactly
// R(2(θ₀-θ)) — a pure rotation. So a point grabbed slightly off the tip stays fixed relative to
// the fold's surface (rather than sliding off it as the fold's aspect ratio changes) if its
// screen-space offset from the tip is rotated by 2(θ₀-θ) as θ moves from its grab-time value θ₀.
// This frame's θ isn't known until after size is solved for below, so the last solved frame's θ
// is used instead — a one-frame lag, invisible at drag sampling rates.
const onFoldDrag = (sheet: HTMLElement, section: HTMLElement, fold: HTMLElement, gesture: FoldGesture, e: PointerEvent, captor: HTMLElement) => {
  // Idempotent — only the first move of a gesture actually needs this, but settleFold relies on
  // it having run at all (a grab that never moved leaves .paper-fold--active untouched, so it
  // knows there's nothing to hand back to the idle CSS rule).
  fold.classList.add('paper-fold--active');

  // Animations outrank inline styles in the cascade, so they have to be dropped outright rather
  // than paused — a paused animation still forces its own value
  sheet.getAnimations().forEach((animation) => animation.cancel());

  const contentRect = sheet.getBoundingClientRect();
  const { x: wPrev, y: hPrev } = currentFoldSize(sheet);
  // The rotating offset keeps a point grabbed on the flap fixed to its surface — only
  // meaningful when the tip itself was grabbed. A crease grab (gain > 1) isn't riding the flap,
  // so its offset stays fixed and the scaled pointer drives the tip directly.
  const offset = gesture.gain === 1
    ? rotateVec(gesture.offset, 2 * (gesture.theta - Math.atan2(hPrev, wPrev)))
    : gesture.offset;

  let tip = {
    x: (gesture.gain * e.clientX - offset.x) - contentRect.right,
    y: (gesture.gain * e.clientY - offset.y) - contentRect.bottom,
  };

  // Paper doesn't stretch: folding keeps the dragged corner within |corner - pin| of the paper
  // clip's pin (folding preserves the corner's distance to every point on the crease, and the
  // crease can at most pass through the pin). Slightly past that rim the fold holds there — the
  // crease pivoting around the pin as the pointer arcs — and, on a forward drag, past the grace
  // margin the drag gives up and lets the fold settle. A back-drag (gain > 1) never gives up:
  // its pointer runs toward the bottom-right and leaves the rim by unfolding the page flat, which
  // is the gesture succeeding, not straying — so it just holds there until the release.
  const pin = pinOf(sheet, contentRect.width, contentRect.height);
  const reach = Math.hypot(pin.x, pin.y);
  const fromPin = { x: tip.x - pin.x, y: tip.y - pin.y };
  const overshoot = Math.hypot(fromPin.x, fromPin.y) - reach;
  if (gesture.gain === 1 && overshoot > FOLD_CANCEL_GRACE) {
    gesture.canceled = true;
    captor.releasePointerCapture(e.pointerId);
    return;
  }
  if (overshoot > 0) {
    const scale = reach / (reach + overshoot);
    tip = { x: pin.x + fromPin.x * scale, y: pin.y + fromPin.y * scale };
  }
  setFlipProgress(sheet, contentRect.width, contentRect.height, tip);

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
  { trackProgress = true, frontOut = false }: { trackProgress?: boolean, frontOut?: boolean } = {},
): (() => void) => {
  // The observed layout size, not getBoundingClientRect: a sheet gliding behind the stack
  // (a back-drag's approach released early) still carries its splay rotation, which would
  // inflate the rect to the rotated bounding box.
  const width = readLength(sheet, '--fold-page-w');
  const height = readLength(sheet, '--fold-page-h');
  const { x: fx, y: fy } = currentFoldSize(sheet);
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
    if (trackProgress) setFlipProgress(sheet, width, height, tip);
    // Read every frame, not once at glide start: restack() begins the stack's own 300ms
    // --fold-back-x/-y transition from 0 to rest, so a value captured up front would go stale
    // mid-glide and paint this sheet's flap without the corner cut the front pages are growing,
    // showing through as a flat grey square.
    renderFold(section, fold, width, height, tip, currentBackFoldSize(sheet), frontOut);

    if (t < 1) {
      frame = requestAnimationFrame(step);
      return;
    }
    onDone();
  };
  frame = requestAnimationFrame(step);

  return () => cancelAnimationFrame(frame);
};

const pageIndex = (page: HTMLElement): number => parseFloat(page.style.getPropertyValue('--page-index'));

// [data-paper-flipped] means there is a previous page to go back to — equivalently, the stack
// isn't in its original order (the originally-first page is always the first DOM child, since
// flips only renumber --page-index, never reorder the DOM). It gates the folded-back top-left
// corner and its grab handle.
const updateFlippedState = (stack: HTMLElement): void => {
  if (pageIndex(stack.children[0] as HTMLElement) === 1) {
    delete stack.dataset.paperFlipped;
  } else {
    stack.dataset.paperFlipped = '';
  }
};

// Puts a front page's fold back in its resting idle state: the dog-ear held at the reveal size
// with the pulse running. The drag (or a back-drag borrowing the flap) cancelled
// initial-fold-reveal, so its forwards-fill is gone for good — leaving --fold-x/-y set here is
// what now holds FOLD_REVEAL_END during fold-reveal-pulse's own delay. Only the pulse (2nd
// slot) gets a fresh run; the reveal (1st slot) stays retired, since restarting it would
// replay its 0cm start and flash the fold back down.
const restIdleFold = (sheet: HTMLElement): void => {
  sheet.style.setProperty('--fold-x', FOLD_REVEAL_END.x);
  sheet.style.setProperty('--fold-y', FOLD_REVEAL_END.y);
  sheet.style.animationName = 'none, none';
  void sheet.offsetWidth;
  sheet.style.animationName = 'none, fold-reveal-pulse';
};

// Glides back to the resting dog-ear, then hands rendering back to index.astro's idle CSS rules
const settleFold = (sheet: HTMLElement, section: HTMLElement, fold: HTMLElement): (() => void) => {
  // Settling means no flip is coming, so the commit feedback drops immediately
  fold.classList.remove('paper-fold--will-flip');
  return glideFoldTip(sheet, section, fold, foldTipFromSize(FOLD_REVEAL_END_PX.x, FOLD_REVEAL_END_PX.y), 1000, () => {
    fold.classList.remove('paper-fold--active');
    clearFoldRender(section, fold);

    restIdleFold(sheet);
    sheet.parentElement!.style.removeProperty('--flip-progress');
    // A settled back-drag may have restored the stack's original order
    updateFlippedState(sheet.parentElement!);
  });
};

// The first half of committing a flip: every page's --page-index shifts down one (the splay
// rotation and paint order both follow it, with the rotate transition re-splaying the pages
// around the shared pin), and the paper-front class plus the clip elements move to the new front
// page — handing the class over restarts its fold-reveal animations. The fold itself stays
// behind on the flipped page so finishFlip can fold it back down behind the stack.
const restack = (sheet: HTMLElement, fold: HTMLElement): void => {
  const stack = sheet.parentElement!;
  const pages = [...stack.children] as HTMLElement[];
  const under = sheet.querySelector<HTMLElement>('.paper-clip-under')!;
  const clip = sheet.querySelector<HTMLElement>('.paper-clip')!;
  const grab = sheet.querySelector<HTMLElement>('.paper-back-grab')!;
  const hint = sheet.querySelector<HTMLElement>('.paper-flip-hint')!;

  fold.classList.remove('paper-fold--will-flip');
  const next = pages.find((page) => pageIndex(page) === 2)!;
  for (const page of pages) {
    const index = pageIndex(page);
    page.style.setProperty('--page-index', `${index === 1 ? pages.length : index - 1}`);
  }
  stack.style.removeProperty('--flip-progress');
  sheet.classList.remove('paper-front');
  next.classList.add('paper-front');
  // The clip's back bar goes before the page content so the page hides it (see index.astro)
  next.prepend(under);
  next.append(clip, grab, hint);
  updateFlippedState(stack);
  syncPaperSurface(next, sectionOf(next));
};

// Drops everything the front-page role leaves behind on a sheet, so its next turn at the front
// starts from index.astro's own rules. animationName above all: restIdleFold pins it inline to
// keep the reveal retired, and an inline name that never changes is a name the fold-reveal
// animations can't be restarted under — the page would come back to the front with no dog-ear at
// all, just the flap's 1px border.
const clearFrontFold = (sheet: HTMLElement): void => {
  sheet.style.removeProperty('--fold-x');
  sheet.style.removeProperty('--fold-y');
  sheet.style.removeProperty('--paper-surface');
  sheet.style.animationName = '';
};

// The second half: the flipped page's inline fold state is fully cleared — so its next turn at
// the front starts fresh — and the fold rejoins the new front page's companions.
const finishFlip = (sheet: HTMLElement, section: HTMLElement, fold: HTMLElement): void => {
  const stack = sheet.parentElement!;
  fold.classList.remove('paper-fold--active');
  clearFoldRender(section, fold);
  clearFrontFold(sheet);
  // A back-drag's approach phase drives the sheet's splay rotation inline (transition frozen);
  // clearing both here lets the restored transition ease the sheet back into the fan.
  sheet.style.rotate = '';
  sheet.style.transition = '';
  const front = stack.querySelector<HTMLElement>('.paper-front')!;
  front.insertBefore(fold, front.querySelector('.paper-back-grab'));
};

// Inverse of a flip's restack: promotes the page most recently sent to the back (the highest
// --page-index) over the front, handing it the front-page role and companion elements. Runs
// mid-gesture, at the moment a back-drag's approach phase completes: the fold is looked up
// stack-wide (the approach already moved it onto the promoted page), and the grab handle stays
// behind on the old front page — moving it here would risk dropping the pointer capture the
// gesture lives on; the release handler brings it over once capture ends.
const bringToFront = (stack: HTMLElement): HTMLElement => {
  const pages = [...stack.children] as HTMLElement[];
  const front = pages.find((page) => pageIndex(page) === 1)!;
  const prev = pages.find((page) => pageIndex(page) === pages.length)!;
  const under = front.querySelector<HTMLElement>('.paper-clip-under')!;
  const clip = front.querySelector<HTMLElement>('.paper-clip')!;
  const fold = stack.querySelector<HTMLElement>('.paper-fold')!;
  const hint = front.querySelector<HTMLElement>('.paper-flip-hint')!;

  for (const page of pages) {
    const index = pageIndex(page);
    page.style.setProperty('--page-index', `${index === pages.length ? 1 : index + 1}`);
  }
  front.classList.remove('paper-front');
  clearFrontFold(front);
  prev.classList.add('paper-front');
  prev.prepend(under);
  prev.append(clip, fold, hint);
  syncPaperSurface(prev, sectionOf(prev));
  return prev;
};

// A back-drag's approach phase: the hindmost page, still behind the stack, folds over in
// proportion to how far the pointer has pulled along the resting crease's normal. The tip runs
// the straight line from the flat corner to its reflection across that crease — a point that
// lies exactly on the pin's reach circle — while the sheet's splay unwinds in step, so the
// page visibly rises and swings into alignment as it comes over the clip. It's still behind the
// clip throughout, hence frontOut: what rises into view is the page's own content, which is
// both what a face-down sheet folded over shows and the affordance the gesture needs — you can
// see which page you're pulling back. The completed fold's
// crease coincides with the corner cut every page already wears, so promoting the page at that
// exact moment changes nothing on screen: the ordinary unfold drag (onFoldDrag, gain 2) takes
// over seamlessly, with the pointer offset re-derived for continuity.
const onBackApproach = (sheet: HTMLElement, section: HTMLElement, fold: HTMLElement, gesture: FoldGesture, e: PointerEvent) => {
  const approach = gesture.approach!;
  const w = readLength(sheet, '--fold-page-w');
  const h = readLength(sheet, '--fold-page-h');
  const along = (e.clientX - approach.origin.x) * approach.dir.x
    + (e.clientY - approach.origin.y) * approach.dir.y;
  const s = Math.min(Math.max(along / BACK_APPROACH_DISTANCE, 0), 1);
  const tip = { x: approach.seed.x * s, y: approach.seed.y * s };
  const size = foldSizeFromTip(tip.x, tip.y);
  sheet.style.setProperty('--fold-x', `${size.x}px`);
  sheet.style.setProperty('--fold-y', `${size.y}px`);
  sheet.style.rotate = `${approach.startRotate * (1 - s)}deg`;
  renderFold(section, fold, w, h, tip, currentBackFoldSize(sheet), true);
  if (s < 1) return;

  // Fully over the clip — promote the page and hand the rest of the gesture to the unfold drag
  sheet.style.rotate = '';
  sheet.style.transition = '';
  bringToFront(sheet.parentElement!);
  setFlipProgress(sheet, w, h, tip);
  sheet.getAnimations().forEach((animation) => animation.cancel());
  gesture.approach = null;
  onFoldGrab(sheet, gesture, e);
};

// A committed flip: glide the tip the rest of the way out to the pin's reach circle — radially
// outward from the pin through wherever the tip is now, so the flip keeps going the way the
// drag was headed (a corner dragged up over the top edge finishes flipping over the top, not
// sideways). Any rim point is a full fold: the crease passes through the pin there. Restacking
// happens at the rim, and then the flipped sheet — now behind the stack — visibly folds back
// down, its tip gliding home to the page corner, before its fold state is cleared for good.
//
// The rim is also where the sheet passes the clip, so the second glide renders frontOut: on the
// way out the sheet is still face-up and the flap shows its blank back, but once it's round the
// back the printed side is what's folded over, and the page's content is what swings down.
const flipFold = (sheet: HTMLElement, section: HTMLElement, fold: HTMLElement): (() => void) => {
  const { width, height } = sheet.getBoundingClientRect();
  const pin = pinOf(sheet, width, height);
  const reach = Math.hypot(pin.x, pin.y);
  const { x: fx, y: fy } = currentFoldSize(sheet);
  const from = foldTipFromSize(fx, fy);
  let dir = { x: from.x - pin.x, y: from.y - pin.y };
  const length = Math.hypot(dir.x, dir.y);
  // A tip at the pin itself has no direction to continue in — fall back to straight across
  if (length < 1) dir = { x: pin.x, y: pin.y };
  const scale = reach / Math.hypot(dir.x, dir.y);
  const to = { x: pin.x + dir.x * scale, y: pin.y + dir.y * scale };
  let settling = false;
  let cancelGlide = glideFoldTip(sheet, section, fold, to, 300, () => {
    restack(sheet, fold);
    settling = true;
    cancelGlide = glideFoldTip(sheet, section, fold, { x: 0, y: 0 }, 250, () => {
      settling = false;
      finishFlip(sheet, section, fold);
    }, { trackProgress: false, frontOut: true });
  });
  // A re-grab mid-fold-back-down fast-forwards to the settled end state
  return () => {
    cancelGlide();
    if (settling) finishFlip(sheet, section, fold);
  };
};

const shouldFlip = (sheet: HTMLElement): boolean => {
  const { width, height } = sheet.getBoundingClientRect();
  const { x: fx, y: fy } = currentFoldSize(sheet);
  return centerFolded(width, height, foldTipFromSize(fx, fy));
};

const releaseFold = (sheet: HTMLElement, section: HTMLElement, fold: HTMLElement, canceled: boolean): (() => void) => {
  // A grab that never dragged left the animations alone, so there is nothing to hand back
  if (sheet.style.getPropertyValue('--fold-x') === '') return () => {};

  const hasBack = sheet.parentElement!.childElementCount > 1;
  if (!canceled && hasBack && shouldFlip(sheet)) return flipFold(sheet, section, fold);
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

// Outside a drag, approaching the front page's top-left corner rotates the hindmost page out
// from behind the stack, teasing the drag-back gesture by showing the page it would bring
// over. --paper-peek feeds into the pages' splay rotation (see index.astro); the rotate
// transition there eases every update, so the peek follows the pointer smoothly and glides
// back on its own once the property is cleared.
const attachBackFoldTease = (stack: HTMLElement, isDragging: () => boolean) => {
  const clearTease = () => {
    for (const page of stack.children) (page as HTMLElement).style.removeProperty('--paper-peek');
  };

  stack.addEventListener('pointermove', (e) => {
    if (!('paperFlipped' in stack.dataset) || isDragging()) return;
    const corner = stack.querySelector<HTMLElement>('.paper-front')!.getBoundingClientRect();
    const distance = Math.hypot(e.clientX - corner.left, e.clientY - corner.top);
    if (distance >= BACK_TEASE_RADIUS) {
      clearTease();
      return;
    }
    const pages = [...stack.children] as HTMLElement[];
    const back = pages.find((page) => pageIndex(page) === pages.length)!;
    const t = 1 - distance / BACK_TEASE_RADIUS;
    // Counter-fan (negative): the page pivots up, rising above the stack's top edge — the
    // direction the drag would bring it over — instead of sinking deeper into the fan.
    back.style.setProperty('--paper-peek', `${-BACK_TEASE_PEEK * t}deg`);
  });
  stack.addEventListener('pointerleave', clearTease);

  return clearTease;
};

const attachFoldDrag = (fold: HTMLElement, grab: HTMLElement) => {
  // Re-derived on every grab: a completed flip moves the fold (and its companion elements) onto
  // the new front page, so the sheet and section they ride on change over time.
  let sheet = fold.parentElement!;
  let section = sectionOf(sheet);
  let gesture: FoldGesture | null = null;
  let cancelSettle: () => void = () => {};

  syncPaperSurface(sheet, section);
  const clearTease = attachBackFoldTease(sheet.parentElement!, () => gesture !== null);

  fold.addEventListener('pointerdown', (e) => {
    if (gesture !== null || e.button !== 0 || !e.isPrimary) return;
    e.preventDefault();
    e.stopPropagation();

    // Grabbing mid-settle freezes the fold where it is and takes over from there — and a grab
    // mid-fold-back-down fast-forwards that flip first, so the fold is back on the front page
    // before the parent is read.
    cancelSettle();
    sheet = fold.parentElement!;
    section = sectionOf(sheet);
    syncPaperSurface(sheet, section);
    clearTease();

    gesture = { pointerId: e.pointerId, offset: { x: 0, y: 0 }, theta: 0, gain: 1, canceled: false, approach: null };
    onFoldGrab(sheet, gesture, e);
    try {
      fold.setPointerCapture(e.pointerId);
    } catch {
      gesture = null;
      cancelSettle = releaseFold(sheet, section, fold, true);
    }
  });

  fold.addEventListener('pointermove', (e) => {
    if (gesture === null || e.pointerId !== gesture.pointerId) return;
    if (!fold.hasPointerCapture(e.pointerId)) return;
    if (e.buttons === 0) {
      fold.releasePointerCapture(e.pointerId);
      return;
    }
    onFoldDrag(sheet, section, fold, gesture, e, fold);
  });

  // Pointer capture is released — on pointerup *or* pointercancel — right before this fires, so
  // it's the one place that decides what the released fold does: flip onto the back of the
  // stack, or settle back to its resting size.
  fold.addEventListener('lostpointercapture', (e) => {
    if (gesture === null || e.pointerId !== gesture.pointerId) return;
    const { canceled } = gesture;
    gesture = null;
    cancelSettle = releaseFold(sheet, section, fold, canceled);
  });

  // A back-drag released before its approach completed: the previous page folds back down
  // behind the stack and the front page gets its flap and resting dog-ear back, leaving the
  // stack exactly as the grab found it.
  const returnBehind = (): (() => void) => {
    let done = false;
    const front = sheet.parentElement!.querySelector<HTMLElement>('.paper-front')!;
    const finish = () => {
      done = true;
      finishFlip(sheet, section, fold);
      restIdleFold(front);
    };
    const cancelGlide = glideFoldTip(sheet, section, fold, { x: 0, y: 0 }, 250, finish, { trackProgress: false, frontOut: true });
    return () => {
      cancelGlide();
      if (!done) finish();
    };
  };

  // Going back a page runs in two phases. First the approach: grabbing the folded-back corner
  // moves only the fold flap onto the hindmost page — which stays behind the stack — so
  // nothing snaps into place; dragging folds it progressively over the clip (onBackApproach).
  // The moment it has come fully over it is promoted, and the same drag machinery as the
  // forward fold unfolds it from there. The shared release threshold then decides both
  // directions: still center-folded sends it back where it came from, unfolded past center
  // settles it as the new front page.
  grab.addEventListener('pointerdown', (e) => {
    if (gesture !== null || e.button !== 0 || !e.isPrimary) return;
    const stack = grab.parentElement!.parentElement!;
    if (!('paperFlipped' in stack.dataset)) return;
    e.preventDefault();
    e.stopPropagation();

    cancelSettle();
    clearTease();
    const pages = [...stack.children] as HTMLElement[];
    const front = stack.querySelector<HTMLElement>('.paper-front')!;
    sheet = pages.find((page) => pageIndex(page) === pages.length)!;
    section = sectionOf(sheet);
    syncPaperSurface(sheet, section);

    // The front page lends its flap to paint the arriving page's fold, so its own resting
    // dog-ear relaxes flat for the duration (restored by returnBehind if the drag lets go).
    front.getAnimations().forEach((animation) => animation.cancel());
    front.style.removeProperty('--fold-x');
    front.style.removeProperty('--fold-y');
    sectionOf(front).style.clipPath = '';

    const w = readLength(sheet, '--fold-page-w');
    const h = readLength(sheet, '--fold-page-h');
    sheet.append(fold);
    fold.classList.add('paper-fold--active');
    // Active mode sizes the flap to the whole page, and the idle clip-path it still carries fills
    // that box at fold 0 — a page-sized slab of flap colour on a sheet whose top-left corner shows
    // through the front page's cut. Render the degenerate fold now so it starts out hidden.
    renderFold(section, fold, w, h, { x: 0, y: 0 }, currentBackFoldSize(sheet), true);
    const restSize = backRestSize(sheet);
    const nl = Math.hypot(restSize.x, restSize.y);
    const nx = restSize.y / nl, ny = restSize.x / nl;
    const dist = nx * w + ny * h - restSize.x * restSize.y / nl;
    const rotate = getComputedStyle(sheet).rotate;

    // The approach drives this sheet's rotation by hand (unwinding the splay and any tease
    // peek as the page comes over), so the splay transition is frozen out of the way.
    sheet.style.transition = 'none';

    gesture = {
      pointerId: e.pointerId, offset: { x: 0, y: 0 }, theta: 0, gain: 2, canceled: false,
      approach: {
        seed: { x: -2 * dist * nx, y: -2 * dist * ny },
        origin: { x: e.clientX, y: e.clientY },
        dir: { x: nx, y: ny },
        startRotate: rotate === 'none' ? 0 : parseFloat(rotate),
      },
    };
    try {
      grab.setPointerCapture(e.pointerId);
    } catch {
      gesture = null;
      cancelSettle = returnBehind();
    }
  });

  grab.addEventListener('pointermove', (e) => {
    if (gesture === null || e.pointerId !== gesture.pointerId) return;
    if (!grab.hasPointerCapture(e.pointerId)) return;
    if (e.buttons === 0) {
      grab.releasePointerCapture(e.pointerId);
      return;
    }
    if (gesture.approach) {
      onBackApproach(sheet, section, fold, gesture, e);
    } else {
      onFoldDrag(sheet, section, fold, gesture, e, grab);
    }
  });

  // Unlike the forward drag, a canceled back-drag shouldn't force a settle — straying past the
  // grace margin lets go with the fold still near-fully folded, and the geometric threshold
  // already resolves that to "return to the back", which is what canceling should mean here.
  grab.addEventListener('lostpointercapture', (e) => {
    if (gesture === null || e.pointerId !== gesture.pointerId) return;
    const { approach } = gesture;
    gesture = null;
    if (approach) {
      cancelSettle = returnBehind();
      return;
    }
    // The grab handle sat out the promotion so the DOM move couldn't break its pointer
    // capture; with the gesture over it rejoins its sheet, back in canonical sibling order.
    sheet.insertBefore(grab, sheet.querySelector('.paper-flip-hint'));
    cancelSettle = releaseFold(sheet, section, fold, false);
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
  for (const name of [
    '--fold-x', '--fold-y', '--fold-back-x', '--fold-back-y', '--fold-back-rest-x',
    '--fold-back-rest-y', '--fold-pin-x', '--fold-pin-y', '--fold-page-w', '--fold-page-h',
  ]) {
    registerProperty({ name, syntax: '<length>', inherits: true, initialValue: '0px' });
  }
  registerProperty({ name: '--page-index', syntax: '<number>', inherits: true, initialValue: '1' });
  registerProperty({ name: '--flip-progress', syntax: '<number>', inherits: true, initialValue: '0' });
};

export function initPaperStackFold(): void {
  const run = () => {
    registerFoldProperties();
    for (const stack of document.querySelectorAll<HTMLElement>('[data-paper-stack-root]')) {
      const fold = stack.querySelector<HTMLElement>('.paper-fold');
      const grab = stack.querySelector<HTMLElement>('.paper-back-grab');
      if (!fold || !grab) continue;
      observeFoldPageSizes(stack);
      attachFoldDrag(fold, grab);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
}
