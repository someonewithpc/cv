// Wires up the draggable "dog-ear" fold on each [data-paper-stack-root]'s front page — a drag
// released with the page's center folded over flips the page onto the back of the stack, and
// grabbing the folded-back top-left corner runs the same gesture in reverse to bring the
// previous page back — and registers the CSS custom properties (--fold-x, --fold-y,
// --fold-back-x, --fold-back-y, --fold-back-rest-x, --fold-back-rest-y, --fold-pin-x,
// --fold-pin-y, --fold-page-w, --fold-page-h, --page-index, --flip-progress) the stack's
// styles (in index.astro) key off of.

import { setStackTurning } from '@/client/frontPage';

type Vec = { x: number, y: number };

// What a release hands the glide that takes over: where the throw's speed would coast the fold's
// tip to, and that speed (px per ms). See coastTip.
type Throw = { at: Vec, speed: number };

// What drives a fold: somewhere the gesture is pulling towards, at the moment it got there. A
// pointer is one (a PointerEvent satisfies this as it stands); a horizontal scroll walks a point
// of its own along the fold's line (see attachScrollFlip), so both run the same machinery.
type Pull = { clientX: number, clientY: number, timeStamp: number };

type FoldGesture = {
  pointerId: number;
  // Scaled pointer minus tip at gesture start, in tip-local screen coordinates — rotates with
  // the fold as it's dragged when the tip itself is grabbed, see the note on onFoldDrag
  offset: Vec;
  // atan2(fold-y, fold-x) at gesture start, needed to know how far that offset has rotated
  theta: number;
  // The fold size the last frame solved for. The drag needs the previous frame's size (for the
  // rotating-offset correction, see onFoldDrag) and it's a value the drag itself computes —
  // carrying it here is what lets a frame get through without asking computed style for the
  // very numbers the frame before just wrote, a read-after-write that forces the browser to
  // re-resolve style mid-frame. Seeded from one computed-style read at the grab (onFoldGrab).
  size: Vec;
  // Pointer-to-tip amplification. 1 when the tip corner itself is grabbed (the forward fold);
  // 2 when the folded-back crease corner is (the back gesture) — moving a crease by d moves
  // the corner reflected across it by 2d, so this is what keeps that drag feeling physical.
  gain: number;
  // Set when the drag gives up (pointer strayed past the grace margin) — the release then
  // always settles back rather than considering a flip.
  canceled: boolean;
  // Client coordinates the gesture grabbed at, for a forward drag's own outward-travel check
  // (see FOLD_CANCEL_OUTWARD_MARGIN) — the raw pointer, not gesture.offset, which is tip-local
  // and rotates with the fold as it's dragged.
  grabAt: Vec;
  // The direction the tip lies in while the page is folded over, fixed when a back-drag's
  // approach hands the gesture on. The tip may run all the way back to the page corner along it
  // but no further: paper unfolds flat, it doesn't keep going and fold the other way.
  unfoldFrom: Vec | null;
  // Present while a back-drag is still in its approach phase — the previous page folding up
  // behind the stack, before it has come over the clip (see onBackApproach). Cleared when the
  // approach completes and the page is promoted.
  approach: {
    // The fully-folded tip: the page corner reflected across the resting crease
    seed: Vec;
    // The pull that folds the page fully over, ending this phase (see BACK_APPROACH_PULL)
    pull: number;
    // How far the approach has come: 0 lying flat behind the stack, 1 fully folded over
    s: number;
    // Where the page's corner currently lies (page coords) — the reverse landing's drag target
    t: Vec;
  } | null;
  // Present for a whole back-drag, both phases. Bringing the page over the clip and unfolding it
  // flat in front are one drag in one direction, so one measure spans them: the pointer's travel
  // from the grab along the pull (the resting crease's normal), which is what the commit is read
  // off (see BACK_COMMIT_REACH) rather than the fold's own geometry.
  back: {
    origin: Vec;
    dir: Vec;
    trail: { along: number, time: number }[];
  } | null;
  // The tip's recent positions, each with the event time that put it there, trimmed to the last
  // THROW_WINDOW_MS — what the release reads the hand's speed off (see coastTip).
  trail: { tip: Vec, time: number }[];
};

// Must match the "to" keyframe of initial-fold-reveal in index.astro
const FOLD_REVEAL_END = { x: '2cm', y: '1cm' };
const PX_PER_CM = 96 / 2.54;
const FOLD_REVEAL_END_PX = { x: 2 * PX_PER_CM, y: 1 * PX_PER_CM };

// How far past the paper's reach (see the pin check in onFoldDrag) the pointer may stray while
// the fold holds at its limit, before the drag lets go entirely.
const FOLD_CANCEL_GRACE = 48;

// How far a forward drag's pointer may travel outward — down and right, away from the page,
// the opposite of the pull that folds it over — before the drag gives up. The pin-overshoot
// grace above only catches a hand that has already dragged the fold most of the way back out to
// its limit; a hand pulling the wrong way from the start runs the tip toward the near-zero
// singularity in foldSizeFromTip long before the pin ever sees it, so this reads the pointer's
// own travel from the grab instead of the fold's geometry. A plain fraction of the page diagonal
// looked like the natural scale at first, but the resting dog-ear that this measures against is
// a fixed size in cm (see FOLD_REVEAL_END, $fold-rest-x/-y in index.astro), not a share of the
// page, so the singularity sits the same few pixels out from the grab on a phone sheet as on a
// wide desktop one — a diagonal-scaled margin would let a big sheet wander much further into the
// odd shapes than a small one before giving up. So this is a plain pixel count instead, tuned
// against the actual --fold-x/-y readings a drag produces: 2px out is barely off the resting
// size, 8px is already a third again as big, and past 12px the size rockets past 300px and then
// flips negative. 10px sits ahead of that runaway growth with room for a hand that wavers a few
// pixels on grab.
const FOLD_CANCEL_OUTWARD_MARGIN = 10;

// Outside a drag, a pointer within BACK_TEASE_RADIUS of the front page's top-left corner
// rotates the hindmost page out from behind the stack — up to BACK_TEASE_PEEK degrees right at
// the corner — showing the page waiting back there to be dragged over.
const BACK_TEASE_RADIUS = 160;
const BACK_TEASE_PEEK = 5;

// Pointer travel, projected along the pull direction (the resting crease's normal), that folds
// the previous page fully over the clip during a back-drag's approach phase — as a fraction of
// the fold's own reach (the run out to the fully-folded tip), so the corner always travels the
// same multiple of the pointer. A fixed pixel pull made that multiple a page's own business:
// wide pages carried the corner nearly twice as far per pixel as portrait ones, leaving a
// portrait page feeling far heavier to bring back over than the same drag on a wide one.
const BACK_APPROACH_PULL = 0.105;

// What a back-drag has to be pulled to commit: the pointer a quarter of the way to the page's
// opposite corner, measured from the grab along the pull. Reading it off the pointer's own travel
// rather than off where the fold has got to is what makes the gesture answer to the hand — the
// unfold moves the corner at twice the pointer, so a commit staked on the fold's geometry (the
// crease receding past a point a third of the way in, as it was) took a drag half way to the
// corner to satisfy, twice what it looks like it is asking for. As a share of the whole
// gesture — the pull that brings the page over plus the unfold that lays it flat — a quarter of
// the diagonal sits a little inside where a forward drag's own commit falls in its, so fetching a
// page back asks slightly less of the hand than sending one away. It lands not far past the point
// the page finishes coming over the clip (BACK_APPROACH_PULL), which leaves a short stretch — the
// tail of the approach and the first of the unfold — for a drag to be taken back in.
const BACK_COMMIT_REACH = 0.25;

// A horizontal scroll works the fold the way a drag does, along the same line, so this is what a
// scrolled pixel is worth against a dragged one — 1 keeps the paper level with the scroll, and a
// swipe that would carry a drag past its commit carries the scroll past it too.
const SCROLL_GAIN = 1;

// What a swipe sending the page away is worth against one fetching the last page back. A swipe
// walks a point along the gesture's line and the gesture takes it from there at its own gain (see
// FoldGesture's gain): the forward fold moves its tip with the point, while a back-drag pushes a
// crease and the corner reflected across it moves at twice that. Both commit once the paper has
// carried its corner half the page's diagonal, so at equal gains the same swipe turned a page back
// on half the travel it took to send one away — a quarter of the diagonal against a half. A
// trackpad flick that fetched a page back would not send the next one away at all. So the forward
// swipe is walked out at the back-drag's gain and a swiped pixel buys the same page turn either
// way. A pointer on the flap is unaffected: it holds the corner it grabbed, at its own gain.
const SWIPE_AWAY_GAIN = 2;

// A scroll has no letting go to end on, so the gesture ends once the wheel has been quiet — but
// how quiet counts as over depends on how the scrolling is being done. A flick lands events a
// frame apart; two fingers moved slowly, or a wheel clicked round a notch at a time, can leave a
// quarter-second between them. One fixed wait can't serve both: short enough to end a flick
// promptly, it cut a slow scroll into a stutter of separate gestures, each folding the page a
// little and letting it settle back. So the wait follows the scrolling itself — a few times the
// gap between the events actually arriving, bounded either side. Trackpad momentum keeps events
// coming after the fingers lift and that is travel like any other, so a flick coasts the fold on
// past where the fingers left it and the release reads it there, which is the same bargain the
// drag's own throw strikes.
const SCROLL_IDLE_GAPS = 4;
const SCROLL_IDLE_MIN = 140;
const SCROLL_IDLE_MAX = 800;

// A wheel with detents hands its travel over in lumps, so the fold eases after the scrolling
// rather than snapping to it (see followScroll), on a time constant taken from the same pace: a
// fraction of the interval the events are arriving at. Where they are already close together —
// a trackpad — that fraction is a frame or two and the easing can't be seen; where they arrive a
// notch apart it spreads each lump across the wait for the next one, which is what turns a row
// of steps back into a movement. Bounded either side so a frantic scroll still feels fastened to
// the paper, and a very slow one doesn't leave the fold drifting long after the hand stopped.
const SCROLL_SMOOTH_GAP = 0.6;
const SCROLL_SMOOTH_MIN = 20;
const SCROLL_SMOOTH_MAX = 150;

// How far a finger has to run sideways before the swipe is taken as one: enough that a tap, or
// the first waver of a scroll the browser is about to claim, doesn't start folding the page.
const SWIPE_START = 8;

// Paper thrown at the stack keeps going after the hand lets go. The release measures the commit
// against where the tip would coast to on the speed it was let go at — THROW_COAST_MS of travel
// at the average speed of the drag's last THROW_WINDOW_MS — rather than where the tip stood at
// that instant, so a flick commits on the strength of the throw and a drag laid down gently
// still has to be carried past the threshold by hand. Averaging over a window rather than
// differencing the last two events keeps a single stuttering frame (or a pointer that jitters as
// the button comes up) from being read as the throw.
const THROW_WINDOW_MS = 100;
const THROW_COAST_MS = 120;

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

// Reading a custom property means resolving style, and resolving style after something has been
// written to the element means the browser has to redo it there and then. A frame that reads,
// writes, reads, writes pays for that flush every time it turns around; one that takes all its
// readings first pays once. So every read below goes through one of these — each taking a single
// computed-style object and pulling every value it needs off it — and the callers are arranged to
// use them before they write anything.
const lengthsOf = (el: HTMLElement, ...names: string[]): number[] => {
  const style = getComputedStyle(el);
  return names.map((name) => parseFloat(style.getPropertyValue(name)));
};

const currentFoldSize = (sheet: HTMLElement): Vec => {
  const [x, y] = lengthsOf(sheet, '--fold-x', '--fold-y');
  return { x, y };
};

// The corner cut and the drift together, off one computed-style object: what a landing frame
// needs, and all it reads. (The drift is how far a turned page's corner cut stands over from its
// left edge — see --turned-drift in index.astro; the page slides back by the same amount, so the
// cut stays on the stack's edge.)
//
// Both are transitioned, and every one of those transitions is started from this file: the cut
// by a change of flipped state (300ms, on the stack), the drift by a renumbering (250ms, on the
// page). Outside those windows the answer is last frame's, so a frame that asked again was
// buying a style resolve to be told nothing had moved — and on this page that resolve is a
// whole-document one whenever anything at all has touched a class, an attribute or the node tree
// since the last paint, which a demo playing under the paper does several times a second. So the
// reading is kept, and refreshed only while one of those transitions could still be running.
// stirLanding below marks every place that starts one, plus the two that can move the values
// without a transition at all — a resize and a theme change, both of which re-derive the em
// lengths the cut is written in.
const LANDING_SETTLE_MS = 600;

const landingLive = new WeakMap<HTMLElement, number>();
const landingCache = new WeakMap<HTMLElement, { back: Vec, drift: number }>();

const stirLanding = (stack: HTMLElement): void => {
  landingLive.set(stack, performance.now() + LANDING_SETTLE_MS);
};

const currentLanding = (sheet: HTMLElement): { back: Vec, drift: number } => {
  const kept = landingCache.get(sheet);
  if (kept && performance.now() > (landingLive.get(sheet.parentElement!) ?? 0)) return kept;
  const [x, y, drift] = lengthsOf(sheet, '--fold-back-x', '--fold-back-y', '--turned-drift');
  const fresh = { back: { x, y }, drift: drift || 0 };
  landingCache.set(sheet, fresh);
  return fresh;
};

const currentBackFoldSize = (sheet: HTMLElement): Vec => currentLanding(sheet).back;

// What a gesture reads off a sheet but never writes: the page's own pixel size, the pin the paper
// is held at, and the resting crease's intercepts. The last two are fixed by the stylesheet in em
// and the first is measured by the ResizeObserver that feeds --fold-page-w/-h, so none of them
// can move during a gesture — sampling them per frame was pure overhead, and worse, overhead
// spent re-resolving style the same frame had just dirtied. They are taken when the page resizes
// and again as each gesture starts; the frames in between just read this.
type SheetMetrics = { w: number, h: number, pin: Vec, rest: Vec };

const metrics = new WeakMap<HTMLElement, SheetMetrics>();

// `size` comes from the ResizeObserver entry when there is one, so the metrics and the custom
// properties can't disagree about how big the page is.
const sampleMetrics = (sheet: HTMLElement, size?: { width: number, height: number }): SheetMetrics => {
  const [pageW, pageH, pinX, pinY, restX, restY] = lengthsOf(
    sheet, '--fold-page-w', '--fold-page-h', '--fold-pin-x', '--fold-pin-y',
    '--fold-back-rest-x', '--fold-back-rest-y',
  );
  const w = size ? size.width : pageW;
  const h = size ? size.height : pageH;
  const sampled = { w, h, pin: { x: pinX - w, y: pinY - h }, rest: { x: restX, y: restY } };
  metrics.set(sheet, sampled);
  return sampled;
};

const metricsOf = (sheet: HTMLElement): SheetMetrics => metrics.get(sheet) ?? sampleMetrics(sheet);

// The flip hint that pairs with each fold flap — one of each per stack, moving between pages
// together, so the pairing never changes and renderFold needn't re-query it every frame.
const hintOf = new WeakMap<HTMLElement, HTMLElement>();

// The fully-folded tip: the page corner reflected across the resting crease — the farthest
// point the fold can carry it, out past the paper clip to the page's upper left. The resting
// crease passes through the pin, so this lies exactly on the pin's reach circle, and its fold's
// crease coincides with the folded-back corner cut every flipped page wears — which makes it
// both where a forward flip finishes folding and where a back-drag starts from.
const restSeed = ({ w, h, rest }: SheetMetrics): Vec => {
  const nl = Math.hypot(rest.x, rest.y);
  const nx = rest.y / nl, ny = rest.x / nl;
  const dist = nx * w + ny * h - rest.x * rest.y / nl;
  return { x: -2 * dist * nx, y: -2 * dist * ny };
};

// The page content — the sibling whose clip-path cuts the holes (the flap, clip, grab handle,
// and hint ride above that cut, see index.astro).
const sectionOf = (sheet: HTMLElement): HTMLElement =>
  sheet.querySelector<HTMLElement>(':scope > :not(.paper-fold, .paper-back-grab, .paper-clip, .paper-clip-under, .paper-flip-hint)')!;

const syncPaperSurface = (sheet: HTMLElement, section: HTMLElement): void => {
  sheet.style.setProperty('--paper-surface', getComputedStyle(section).backgroundColor);
};

// Every page carries its own resolved colour, not just the one the flap rides: a turned page
// paints the back of its sheet in the pile behind the stack (see index.astro), and it is no
// longer at the front to be asked when it does.
const syncStackSurfaces = (stack: HTMLElement): void => {
  for (const page of stack.children as HTMLCollectionOf<HTMLElement>) {
    syncPaperSurface(page, sectionOf(page));
  }
  // The strip behind the crease reads the pile's colour off the page that carries it, so a
  // theme switch has to reach it too.
  syncPileSurface(stack);
};

// The colour above is a snapshot, taken when a gesture starts or a flip hands the flap on, so a
// theme switch in between leaves the dog-ear painted in the theme the page loaded under. Re-lift
// it whenever the theme moves: the picker's explicit choice (data-theme, which it also drops and
// restores around its view transition) or, with no choice stored, the OS preference the page
// falls back to.
const watchThemePaperSurface = (): void => {
  const resync = () => {
    for (const stack of document.querySelectorAll<HTMLElement>('[data-paper-stack]')) {
      // A theme can carry its own type, and the corner cut is written in em.
      stirLanding(stack);
      syncStackSurfaces(stack);
    }
  };
  new MutationObserver(resync).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', resync);
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

// Single-edge Sutherland-Hodgman split (both sides in one pass) of a polygon by the line
// through mid with the given unit normal: kept is the side the normal points to, hole the other.
const splitPolygon = (points: Vec[], mid: Vec, normal: Vec) => {
  const signed = (p: Vec) => (p.x - mid.x) * normal.x + (p.y - mid.y) * normal.y;
  const kept: Vec[] = [];
  const hole: Vec[] = [];
  for (let i = 0; i < points.length; i++) {
    const cur = points[i], next = points[(i + 1) % points.length];
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
  return { kept, hole };
};

// The page rectangle minus the back-fold's top-left corner cut (both cut vertices collapse to
// (0, 0) while the back-fold is 0, i.e. before any page has been flipped). A turned page's cut
// and left edge stand `drift` over, the way index.astro cuts it at rest.
const pagePentagon = (w: number, h: number, back: Vec, drift = 0): Vec[] => [
  { x: back.x + drift, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: drift, y: h }, { x: drift, y: back.y },
];

// The crease is the perpendicular bisector between the page corner (w, h) and the dragged tip
// (given relative to that corner) — the unique line folding one onto the other. Splitting the
// page against it covers every fold the tip can express, including creases that wrap page
// corners or hang off the bottom/right edges, without the closed-form case analysis the idle
// CSS formula needs.
const splitByCrease = (w: number, h: number, tip: Vec, back: Vec) => {
  const length = Math.hypot(tip.x, tip.y);
  const normal = { x: tip.x / length, y: tip.y / length };
  const mid = { x: w + tip.x / 2, y: h + tip.y / 2 };
  return {
    ...splitPolygon(pagePentagon(w, h, back), mid, normal),
    mid,
    angle: Math.atan2(normal.x, -normal.y),
  };
};

// Whether the crease has folded the given point over with the corner — the folded region is
// the corner's side of the crease, so this is the same signed-side convention as splitByCrease,
// negative meaning folded. Used both as live drag feedback and as the release's commit test.
const pointFolded = (point: Vec, w: number, h: number, tip: Vec): boolean => {
  if (Math.hypot(tip.x, tip.y) < 0.5) return false;
  const mid = { x: w + tip.x / 2, y: h + tip.y / 2 };
  return (point.x - mid.x) * tip.x + (point.y - mid.y) * tip.y < 0;
};

// The point a forward drag's release measures the fold against: the flip commits once the fold
// has carried that point over, half way from the dragged corner in to the center, so the gesture
// doesn't have to be hauled all the way past the middle. (A back-drag commits on its pointer's
// own travel instead — see BACK_COMMIT_REACH.)
const commitPoint = (w: number, h: number): Vec => ({ x: w * 3 / 4, y: h * 3 / 4 });

// A back-drag's progress: the pointer's travel from the grab, projected on the pull.
const backAlong = (back: NonNullable<FoldGesture['back']>, at: Pull): number =>
  (at.clientX - back.origin.x) * back.dir.x + (at.clientY - back.origin.y) * back.dir.y;

// The travel that commits it.
const backReach = (sheet: HTMLElement): number => {
  const { w, h } = metricsOf(sheet);
  return Math.hypot(w, h) * BACK_COMMIT_REACH;
};

// The travel a release is judged on: where the throw's speed would carry the pull on to, falling
// back to where it stands when there's no speed to read off.
const backThrow = (back: NonNullable<FoldGesture['back']>, time: number): number =>
  coastAlong(back.trail, time) ?? back.trail[back.trail.length - 1]?.along ?? 0;

const track = <T extends { time: number }>(trail: T[], sample: T): void => {
  trail.push(sample);
  while (trail.length > 1 && sample.time - trail[0].time > THROW_WINDOW_MS) trail.shift();
};

// The stretch of the trail the throw is read off — everything within THROW_WINDOW_MS of the
// release — with the multiplier turning its travel into the coast beyond it. The window is
// measured back from the release, not from the last move: a hand that drags fast, comes to a
// stop and then lets go has thrown nothing, and its stale samples have to age out even though no
// move event came to trim them. Null when what's left can't express a speed (a gesture that never
// moved, or one that held still), and the release then measures where things stand, as it always
// did.
const throwWindow = <T extends { time: number }>(trail: T[], time: number): { from: T, to: T, coast: number } | null => {
  const recent = trail.filter((sample) => time - sample.time <= THROW_WINDOW_MS);
  if (recent.length < 2) return null;
  const from = recent[0];
  const to = recent[recent.length - 1];
  const span = to.time - from.time;
  return span > 0 ? { from, to, coast: THROW_COAST_MS / span } : null;
};

// The throw a release hands on: where its speed would carry the tip, and that speed itself (px
// per ms), which the glide that takes over starts off at.
const coastTip = (trail: FoldGesture['trail'], time: number): Throw | null => {
  const thrown = throwWindow(trail, time);
  if (!thrown) return null;
  const { from, to, coast } = thrown;
  const at = {
    x: to.tip.x + (to.tip.x - from.tip.x) * coast,
    y: to.tip.y + (to.tip.y - from.tip.y) * coast,
  };
  const speed = Math.hypot(at.x - to.tip.x, at.y - to.tip.y) / THROW_COAST_MS;
  // Paper thrown at the corner stops flat there rather than folding up the other way, and the
  // commit test reads a tip past the corner as folded again — from the wrong side — so a coast
  // that would carry the tip through it lands on it instead.
  return { at: at.x * to.tip.x + at.y * to.tip.y <= 0 ? { x: 0, y: 0 } : at, speed };
};

// The same, along a back-drag's approach: how far down the pull the release's speed would carry
// the pointer.
const coastAlong = (trail: { along: number, time: number }[], time: number): number | null => {
  const thrown = throwWindow(trail, time);
  if (!thrown) return null;
  const { from, to, coast } = thrown;
  return to.along + (to.along - from.along) * coast;
};

// Closes the fan by one page for the duration of a drag (--flip-progress on the stack, see
// index.astro), squaring the front page and the one behind it up with each other. Every page
// wears the same folded-back top-left corner, so any splay between those two fans their two cuts
// apart and opens a gap right where the drag has the eye. Easing this in with the fold instead
// would leave the gap open for most of the gesture, which is exactly when it shows.
const holdUnsplayed = (sheet: HTMLElement): void => {
  sheet.parentElement!.style.setProperty('--flip-progress', '1');
};

// Hands the page and its flap back to index.astro's own rules, dropping everything renderFold
// drives inline — the hint's left/top included. Those are page-local pixels, and only a drag
// frame ever recomputes them, so left behind they pin the hint (invisible at rest, but still
// laid out) where the corner of a wider page used to be. Narrow the window after a gesture and
// it stands off the page's right edge, which is scrollable overflow; a tablet answers overflow
// by widening the layout viewport, and every `position: fixed` box rides along — the theme
// picker off the side of the screen with them.
const clearFoldRender = (section: HTMLElement, fold: HTMLElement): void => {
  section.style.clipPath = '';
  section.style.transform = '';
  section.style.transformOrigin = '';
  fold.style.clipPath = '';
  fold.style.transform = '';
  fold.style.transformOrigin = '';
  const hint = hintOf.get(fold);
  if (hint) {
    hint.style.left = '';
    hint.style.top = '';
  }
};

const HIDDEN_CLIP = 'polygon(0px 0px, 0px 0px, 0px 0px)';

const polygonClip = (pts: Vec[]) => `polygon(${pts.map((p) => `${p.x}px ${p.y}px`).join(', ')})`;

// Drives the page's clip-path and .paper-fold directly while dragging (and while settling back
// afterwards) instead of index.astro's idle CSS rules, which only fit the simple
// bottom-and-right-edge crease. The folded-over region is the hole polygon pushed through a
// reflection across the crease line: rotate(α) scaleY(-1) rotate(-α) about any point on the
// crease, α being the crease's direction angle. (Not the idle rule's scaleX(-1) — that one
// reflects across the crease's perpendicular, which only lands right because the idle box-clip
// trick feeds it the opposite triangle.)
//
// The flap takes the reflection, painting the sheet's blank back, wherever the sheet is. In
// front of the stack that's plainly right — a face-up page folded over shows its back. Behind
// it, the pages fan with their printed sides showing, so a fold there doubles that same face
// over and its back is again what rises — never the content mirrored, which a reflection of the
// printed side would be (renderLanding's band, the one fold that runs back there, leans on the
// same fact).
const renderFold = (
  section: HTMLElement, fold: HTMLElement, w: number, h: number, tip: Vec, back: Vec,
): void => {
  const degenerate = Math.hypot(tip.x, tip.y) < 0.5;
  const { kept, hole, mid, angle } = degenerate
    ? { kept: [], hole: [], mid: { x: 0, y: 0 }, angle: 0 }
    : splitByCrease(w, h, tip, back);

  if (degenerate || hole.length < 3) {
    // Degenerate fold (tip at the corner, or crease off the page) — page whole, flap hidden
    section.style.clipPath = '';
    section.style.transform = '';
    section.style.transformOrigin = '';
    fold.style.clipPath = HIDDEN_CLIP;
    return;
  }

  section.style.clipPath = polygonClip(kept);
  section.style.transform = '';
  section.style.transformOrigin = '';
  fold.style.clipPath = polygonClip(hole);
  fold.style.transformOrigin = `${mid.x}px ${mid.y}px`;
  fold.style.transform = `rotate(${angle}rad) scaleY(-1) rotate(${-angle}rad)`;

  // The flip hint rides at the flap's visual center: the hole's centroid pushed through the
  // same reflection the flap paints with. It's a sheet sibling of the flap, not a child, so it
  // stays unmirrored.
  const hint = hintOf.get(fold);
  if (hint) {
    const centroid = polygonCentroid(hole);
    const local = rotateVec({ x: centroid.x - mid.x, y: centroid.y - mid.y }, -angle);
    const reflected = rotateVec({ x: local.x, y: -local.y }, angle);
    hint.style.left = `${mid.x + reflected.x}px`;
    hint.style.top = `${mid.y + reflected.y}px`;
  }
};

const onFoldGrab = (sheet: HTMLElement, gesture: FoldGesture, at: Pull) => {
  // Once per gesture the metrics are taken fresh rather than trusted from the cache — the
  // ResizeObserver keeps them current across resizes, but this is what catches anything that
  // moved the em-based pin without changing the page's pixel size. The landing reading goes with
  // them: one read at the start of a gesture costs nothing and covers whatever moved the corner
  // cut while no stack was being touched.
  sampleMetrics(sheet);
  stirLanding(sheet.parentElement!);
  const size = currentFoldSize(sheet);
  const contentRect = sheet.getBoundingClientRect();
  const tip = foldTipFromSize(size.x, size.y);
  gesture.offset = {
    x: gesture.gain * at.clientX - (contentRect.right + tip.x),
    y: gesture.gain * at.clientY - (contentRect.bottom + tip.y),
  };
  gesture.theta = Math.atan2(size.y, size.x);
  gesture.size = size;
  gesture.grabAt = { x: at.clientX, y: at.clientY };
};

// T(θ), the fold's reflection transform, is self-inverse, and T(θ)·T(θ₀) works out to exactly
// R(2(θ₀-θ)) — a pure rotation. So a point grabbed slightly off the tip stays fixed relative to
// the fold's surface (rather than sliding off it as the fold's aspect ratio changes) if its
// screen-space offset from the tip is rotated by 2(θ₀-θ) as θ moves from its grab-time value θ₀.
// This frame's θ isn't known until after size is solved for below, so the last solved frame's θ
// is used instead — a one-frame lag, invisible at drag sampling rates.
const onFoldDrag = (sheet: HTMLElement, section: HTMLElement, fold: HTMLElement, gesture: FoldGesture, at: Pull) => {
  // Every computed-style and layout read the frame needs, taken before it writes anything: the
  // sheet's screen box (the page can still scroll vertically under a drag), the corner cut
  // (mid-transition for 300ms after a flip state change), and the cached page metrics.
  //
  // These come before the first move's class and attribute writes below, not after. A class or
  // an attribute anywhere on the page invalidates every element the document's :has() rules
  // could reach — which on this page means all of it — so a read taken afterwards makes the
  // browser resolve the whole document on the spot, in the middle of a frame that is about to
  // dirty it again anyway.
  const contentRect = sheet.getBoundingClientRect();
  const backCut = currentBackFoldSize(sheet);
  const sheetMetrics = metricsOf(sheet);
  const { w, h, pin } = sheetMetrics;

  // A gesture's first move (a back-drag arrives with the class already on, its setup done by
  // beginBack/promoteFold): the sheet's animations have to be dropped outright rather than
  // paused — animations outrank inline styles in the cascade, and a paused one still forces its
  // own value — and the fan closes up behind the drag. Neither may repeat per frame: cancelling
  // again would also cancel the rotate *transition* the un-splay rides on, snapping the fan
  // shut one frame after this very handler eased it. settleFold keys off the class to know
  // whether a grab ever became a drag, so it must be added here and not at the grab.
  if (!fold.classList.contains('paper-fold--active')) {
    fold.classList.add('paper-fold--active');
    unsettle(sheet.parentElement!);
    // Cancelling the reveal/pulse animation below drops whatever size it was mid-playing, and
    // nothing else here is guaranteed to write a fresh one this frame: a cancel further down
    // (the outward check that follows, or the pin-overshoot one after it) can return before ever
    // reaching this function's own --fold-x/-y write, on the very first move of a gesture that
    // already crosses one of those margins. Freezing the size the grab captured first (gesture.
    // size, read once in onFoldGrab) keeps the dog-ear at what it visibly was, rather than
    // leaving the property unset and the flap sized calc(var(--fold-x)) of nothing.
    sheet.style.setProperty('--fold-x', `${gesture.size.x}px`);
    sheet.style.setProperty('--fold-y', `${gesture.size.y}px`);
    sheet.getAnimations().forEach((animation) => animation.cancel());
    holdUnsplayed(sheet);
  }

  // A forward drag whose pointer runs outward — down and right, away from the page, the
  // opposite of the pull that folds it over — gives up before the geometry below even sees it.
  // The pin-overshoot check further down only catches a hand that has already dragged the fold's
  // tip most of the way back out to its limit; reading the raw pointer's own travel from the
  // grab instead catches a hand heading the wrong way well before the fold gets there, while the
  // margin keeps a hand that merely wavers a few pixels the wrong way on grab from tripping it.
  // Sideways and inward travel are the ordinary gesture and don't count, only outward travel past
  // the margin, so a pointer that strayed out and comes back inside it before crossing keeps its
  // drag. Back-drags (gain > 1) run their pointer toward the bottom-right on purpose — that's
  // the unfold, not a stray — so this only watches a forward one.
  if (gesture.gain === 1) {
    const pull = restSeed(sheetMetrics);
    const pullLen = Math.hypot(pull.x, pull.y);
    const outward = { x: -pull.x / pullLen, y: -pull.y / pullLen };
    const travel = { x: at.clientX - gesture.grabAt.x, y: at.clientY - gesture.grabAt.y };
    const outwardTravel = travel.x * outward.x + travel.y * outward.y;
    if (outwardTravel > FOLD_CANCEL_OUTWARD_MARGIN) {
      gesture.canceled = true;
      return;
    }
  }

  const { x: wPrev, y: hPrev } = gesture.size;
  // The rotating offset keeps a point grabbed on the flap fixed to its surface — only
  // meaningful when the tip itself was grabbed. A crease grab (gain > 1) isn't riding the flap,
  // so its offset stays fixed and the scaled pointer drives the tip directly.
  const offset = gesture.gain === 1
    ? rotateVec(gesture.offset, 2 * (gesture.theta - Math.atan2(hPrev, wPrev)))
    : gesture.offset;

  let tip = {
    x: (gesture.gain * at.clientX - offset.x) - contentRect.right,
    y: (gesture.gain * at.clientY - offset.y) - contentRect.bottom,
  };

  // An unfold splits the pointer two ways. How far the corner still stands off its home is read
  // only along the unfold axis — the resting crease's normal, the line the page came over on —
  // so any drag carrying some pull along it lays the page flat in the end, whatever its lean;
  // taking that distance from the raw pointer instead left an off-axis drag stuck part-folded
  // forever, since it never brought the tip home. The axis follows the resting lean and not the
  // page: at the landscape lean on a 2:1 page it happens to run down the page's own diagonal, so
  // dragging toward the center unfolded it, but let either the lean or the page shape differ —
  // a portrait page still on that lean puts the drag ~27° off — and the corner never came
  // unfolded at all. Which way the corner points, though, is the pointer's to say — the same
  // freedom the forward fold has, and the approach phase before this one — so it rides the ray
  // out to the pointer at whatever distance the pull has left it, swinging round as the hand
  // arcs rather than sliding stiffly up and down one line. The two agree at the promotion, where
  // the tip sits on the axis and the offset has just been re-derived, so the phases meet without
  // a kink. Clamped at the seed: paper unfolds flat, it doesn't keep going and fold the other
  // way, nor further over than it arrived.
  const { unfoldFrom } = gesture;
  if (unfoldFrom) {
    const span = Math.hypot(unfoldFrom.x, unfoldFrom.y);
    const axis = { x: unfoldFrom.x / span, y: unfoldFrom.y / span };
    const along = Math.min(Math.max(tip.x * axis.x + tip.y * axis.y, 0), span);
    const stand = Math.hypot(tip.x, tip.y);
    const dir = stand > 0 ? { x: tip.x / stand, y: tip.y / stand } : axis;
    tip = { x: dir.x * along, y: dir.y * along };
  }

  // Paper doesn't stretch: folding keeps the dragged corner within |corner - pin| of the paper
  // clip's pin (folding preserves the corner's distance to every point on the crease, and the
  // crease can at most pass through the pin). Slightly past that rim the fold holds there — the
  // crease pivoting around the pin as the pointer arcs — and, on a forward drag, past the grace
  // margin the drag gives up and lets the fold settle. Giving up is left for the caller to act
  // on (releasing its pointer capture, ending its scroll), which is what ends the gesture. A
  // back-drag (gain > 1) never gives up: its pointer runs toward the bottom-right and leaves the
  // rim by unfolding the page flat, which is the gesture succeeding, not straying — so it just
  // holds there until the release.
  const reach = Math.hypot(pin.x, pin.y);
  const fromPin = { x: tip.x - pin.x, y: tip.y - pin.y };
  const overshoot = Math.hypot(fromPin.x, fromPin.y) - reach;
  if (gesture.gain === 1 && overshoot > FOLD_CANCEL_GRACE) {
    gesture.canceled = true;
    return;
  }
  if (overshoot > 0) {
    const scale = reach / (reach + overshoot);
    tip = { x: pin.x + fromPin.x * scale, y: pin.y + fromPin.y * scale };
  }

  const size = foldSizeFromTip(tip.x, tip.y);
  gesture.size = size;
  sheet.style.setProperty('--fold-x', `${size.x}px`);
  sheet.style.setProperty('--fold-y', `${size.y}px`);

  // Live commit feedback: past the threshold the flap brightens and the hint appears, meaning the
  // same thing whichever way the page is going — let go now and the gesture goes through. Forward
  // that is the fold having carried the commit point over; on a back-drag it is the pull having
  // come its quarter of the way, which is the release's own test (see BACK_COMMIT_REACH).
  const { back } = gesture;
  const along = back ? backAlong(back, at) : 0;
  const willCommit = back
    ? along >= backReach(sheet)
    : sheet.parentElement!.childElementCount > 1
      && pointFolded(commitPoint(w, h), w, h, tip);
  fold.classList.toggle('paper-fold--will-commit', willCommit);
  // Same threshold, the other thing it decides: past it the turn is going to happen, so the
  // demo on the paper stops playing (see commitTurn).
  if (willCommit) commitTurn(sheet.parentElement!);

  if (back) track(back.trail, { along, time: at.timeStamp });

  // The tip as the drag actually rendered it — after the pointer gain, the unfold axis and the rim
  // clamp — so the throw is measured on the fold's own motion rather than the hand's: a drag held
  // against the rim has stopped moving the paper however hard it's still pushing, and lets go with
  // nothing to coast on.
  track(gesture.trail, { tip, time: at.timeStamp });
  renderFold(section, fold, w, h, tip, backCut);
};

// The duration that sets an ease-out cubic off at exactly the speed the hand let go at: the ease
// opens at three times its average speed, so that's 3·distance/speed. Used as a ceiling on the
// unhurried glide rather than a replacement, so a throw only ever carries the paper away quicker —
// a fold released mid-crawl still comes home at its own unhurried pace instead of being dragged
// out to match a speed it never had.
const coastMs = (distance: number, speed: number): number => (speed > 0 ? 3 * distance / speed : Infinity);

// Glides the fold's tip to a target along a straight tip-space path, easing out like released
// tension, over a duration scaled to how far the tip has to travel — a long glide takes visibly
// longer than a small nudge — and no longer than the release's own speed would take to cover it.
// Runs on its own rAF clock (rather than a CSS transition on --fold-x/-y) so the path is the
// tip's, not the crease intercepts' — those diverge wildly for large folds — and returns a cancel
// handle so a re-grab mid-glide can take over cleanly.
const glideFoldTip = (
  sheet: HTMLElement, section: HTMLElement, fold: HTMLElement,
  to: Vec, baseMs: number, thrown: number, onDone: () => void,
): (() => void) => {
  // The observed layout size, not getBoundingClientRect: a sheet gliding behind the stack
  // (a back-drag's approach released early) still carries its splay rotation, which would
  // inflate the rect to the rotated bounding box.
  const { w: width, h: height } = metricsOf(sheet);
  const { x: fx, y: fy } = currentFoldSize(sheet);
  const from = foldTipFromSize(fx, fy);
  const distance = Math.hypot(from.x - to.x, from.y - to.y);
  const duration = Math.max(Math.min(baseMs + distance / 3, baseMs + 500, coastMs(distance, thrown)), 120);

  let frame = 0;
  const start = performance.now();
  const step = (now: number) => {
    // Clamped below zero too: a rAF timestamp is the frame's vsync time, which can precede the
    // start captured above, and a negative t would extrapolate the glide backwards past its
    // start.
    const t = Math.min(Math.max((now - start) / duration, 0), 1);
    const eased = 1 - (1 - t) ** 3;
    const tip = { x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased };
    // Read every frame, not once at glide start: restack() begins the stack's own 300ms
    // --fold-back-x/-y transition from 0 to rest, so a value captured up front would go stale
    // mid-glide and paint this sheet's flap without the corner cut the front pages are growing,
    // showing through as a flat grey square. Read before the writes below, though — at the top
    // of a frame style is clean from the last paint, where after a write the browser would have
    // to re-resolve it on the spot.
    const backCut = currentBackFoldSize(sheet);
    const size = foldSizeFromTip(tip.x, tip.y);
    sheet.style.setProperty('--fold-x', `${size.x}px`);
    sheet.style.setProperty('--fold-y', `${size.y}px`);
    renderFold(section, fold, width, height, tip, backCut);

    if (t < 1) {
      frame = requestAnimationFrame(step);
      return;
    }
    onDone();
  };
  frame = requestAnimationFrame(step);

  return () => cancelAnimationFrame(frame);
};

// The second half of a flip: the page lies folded fully over at the resting crease, blank back
// up, and goes over to the back of the stack by folding back down — starting at the extreme
// (the tip, where the page's bottom-right corner ended up) with the fold-back crease
// travelling in to the base, never retracing the first fold. The state is parameterized by t,
// where the page's corner currently lies: the fold-back crease is the perpendicular bisector
// between the corner's packet position (the tip) and t — the unique second fold carrying it
// there. Two reflections compose to a rotation (a translation when the creases are parallel,
// i.e. when t lies on the tip-to-home line), so the folded-back material is the page's own
// printed front — unmirrored, its animations still running — coming home behind the stack as
// t arrives at the corner's natural place. What the crease hasn't reached yet is the
// still-doubled band between it and the base, blank back up, keeping the first fold's frozen
// reflection and shrinking to nothing.
//
// The folded-back material tucks in under the band — the page is sliding in beneath the stack,
// so its returning front goes between the doubled packet and the desk, not on top — and under
// the stack's pages (the restacked sheet is already hindmost). The flap paints after the
// section, so the band covering the front is just their natural order. The never-folded sliver
// beyond the resting crease drops out of the section's clip entirely — behind the stack it sits
// exactly under the other pages' paint, so it can't be seen until the cleared clip returns it
// at the end.
//
// Run in reverse (t pulled from the corner's home out to the tip) this is also a back-drag's
// approach phase — the same fold retraced, lifting the page back up into the fully folded
// state a forward flip restacks in, with t free to leave the straight line so the fold's
// direction follows the pointer (see onBackApproach).
const renderLanding = (
  section: HTMLElement, fold: HTMLElement, w: number, h: number, seed: Vec, back: Vec, t: Vec,
  drift = 0,
): void => {
  const length = Math.hypot(seed.x, seed.y);
  const n = { x: seed.x / length, y: seed.y / length };
  // The seed's crease is the resting cut of a page with no drift. On a page of the pile the cut
  // stands `drift` over, and the crease has to go with it or a sliver of sheet shows between
  // the two, and the paper the page lays down runs out past the stack's left edge. Sliding
  // the crease that far along x moves the corner's reflection by twice the crease's shift
  // along its own normal, which the seed lies along, so t stays on the seed's line.
  const shift = 2 * drift * n.x;
  const seedX = seed.x + shift * n.x;
  const seedY = seed.y + shift * n.y;
  const mid = { x: w + seedX / 2, y: h + seedY / 2 };
  const tip = { x: w + seedX, y: h + seedY };
  const { hole: packet } = splitPolygon(pagePentagon(w, h, back, drift), mid, n);
  const angle = Math.atan2(n.x, -n.y);
  fold.style.transformOrigin = `${mid.x}px ${mid.y}px`;
  fold.style.transform = `rotate(${angle}rad) scaleY(-1) rotate(${-angle}rad)`;

  const d = { x: t.x - tip.x, y: t.y - tip.y };
  const dl = Math.hypot(d.x, d.y);
  if (packet.length < 3 || dl < 0.5) {
    // Nothing folded back yet (or no packet at all): everything still doubled
    section.style.clipPath = HIDDEN_CLIP;
    section.style.transform = '';
    section.style.transformOrigin = '';
    fold.style.clipPath = packet.length < 3 ? HIDDEN_CLIP : polygonClip(packet);
    return;
  }

  const n2 = { x: d.x / dl, y: d.y / dl };
  const mid2 = { x: (tip.x + t.x) / 2, y: (tip.y + t.y) / 2 };
  // The fold-back crease lives on the folded material, so it splits the unfolded page along
  // its pull-back through the first fold (a reflection is its own inverse)
  const proj = (mid2.x - mid.x) * n.x + (mid2.y - mid.y) * n.y;
  const mid2Back = { x: mid2.x - 2 * proj * n.x, y: mid2.y - 2 * proj * n.y };
  const dot = n2.x * n.x + n2.y * n.y;
  const n2Back = { x: n2.x - 2 * dot * n.x, y: n2.y - 2 * dot * n.y };
  const { kept: band, hole: landed } = splitPolygon(packet, mid2Back, n2Back);

  // The landed material paints through both folds composed, Ref2·Ref1 — linear part a rotation,
  // written as an explicit matrix about the page origin
  const r1 = { xx: 1 - 2 * n.x * n.x, xy: -2 * n.x * n.y, yy: 1 - 2 * n.y * n.y };
  const r2 = { xx: 1 - 2 * n2.x * n2.x, xy: -2 * n2.x * n2.y, yy: 1 - 2 * n2.y * n2.y };
  const s1 = 2 * (mid.x * n.x + mid.y * n.y);
  const s2 = 2 * (mid2.x * n2.x + mid2.y * n2.y);
  const b1 = { x: s1 * n.x, y: s1 * n.y };
  const a = r2.xx * r1.xx + r2.xy * r1.xy;
  const b = r2.xy * r1.xx + r2.yy * r1.xy;
  const c = r2.xx * r1.xy + r2.xy * r1.yy;
  const dd = r2.xy * r1.xy + r2.yy * r1.yy;
  const e = r2.xx * b1.x + r2.xy * b1.y + s2 * n2.x;
  const f = r2.xy * b1.x + r2.yy * b1.y + s2 * n2.y;

  section.style.clipPath = landed.length < 3 ? HIDDEN_CLIP : polygonClip(landed);
  section.style.transformOrigin = '0px 0px';
  section.style.transform = `matrix(${a}, ${b}, ${c}, ${dd}, ${e}, ${f})`;
  fold.style.clipPath = band.length < 3 ? HIDDEN_CLIP : polygonClip(band);
};

// The landing's own glide: the corner easing straight from wherever it stands to where the
// gesture leaves it — home for a completed flip or a released approach laying back down, on out
// to the packet tip for an approach thrown the rest of the way over. The back-fold corner cut can
// be mid-transition while this runs (restack() starts the stack's 300ms --fold-back-x/-y
// transition), so the pentagon is re-read every frame.
const glideLanding = (
  sheet: HTMLElement, section: HTMLElement, fold: HTMLElement,
  seed: Vec, from: Vec, to: Vec, ms: number, onDone: () => void,
): (() => void) => {
  const { w: width, h: height } = metricsOf(sheet);
  // Duration in proportion to the flight left to run, so a barely-started approach lays back
  // down quickly instead of crawling
  const distance = Math.hypot(from.x - to.x, from.y - to.y);
  const duration = Math.max(ms * distance / Math.hypot(seed.x, seed.y), 100);
  let frame = 0;
  const start = performance.now();
  const step = (now: number) => {
    const tt = Math.min(Math.max((now - start) / duration, 0), 1);
    const eased = 1 - (1 - tt) ** 3;
    const t = { x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased };
    const { back, drift } = currentLanding(sheet);
    renderLanding(section, fold, width, height, seed, back, t, drift);
    if (tt < 1) {
      frame = requestAnimationFrame(step);
      return;
    }
    onDone();
  };
  frame = requestAnimationFrame(step);
  return () => cancelAnimationFrame(frame);
};

const pageIndex = (page: HTMLElement): number => parseFloat(page.style.getPropertyValue('--page-index'));

// Covered pages leave the tab order and the accessibility tree. The page content is what goes
// inert, not the wrapper: the fold chrome stays a sibling of it and keeps its pointer capture.
const syncInert = (stack: HTMLElement): void => {
  for (const page of stack.children as HTMLCollectionOf<HTMLElement>) {
    sectionOf(page).inert = pageIndex(page) !== 1;
  }
  stack.dispatchEvent(new CustomEvent('paper-flip'));
};

// The flap paints the back of the sheet in the page's own color, but as a sibling of the page
// content it can't see background definitions scoped inside it (e.g. a blueprint page
// redefining its surface variable), so the resolved color is lifted onto the sheet for it.

// [data-paper-flipped] means there is a previous page to go back to — equivalently, the stack
// isn't in its original order (the originally-first page is always the first DOM child, since
// flips only renumber --page-index, never reorder the DOM). It gates the folded-back top-left
// corner and its grab handle.
const updateFlippedState = (stack: HTMLElement): void => {
  // Either branch below can start the corner cut's 300ms transition, so the kept reading has to
  // go stale from here.
  stirLanding(stack);
  const first = pageIndex(stack.children[0] as HTMLElement);
  if (first === 1) {
    delete stack.dataset.paperFlipped;
  } else {
    stack.dataset.paperFlipped = '';
  }
  // How many pages have been turned, which is what the stack's own styles show as a pile behind
  // it (see index.astro). The originally-first page counts them on its own: a flip sends the
  // front page to the back and shifts every other page down one, so that page's distance from
  // the back is how many turns it has sat through. Back at 1 it is the front page again and the
  // stack has come full circle, which is no pages turned rather than all of them.
  stack.style.setProperty('--pages-turned', `${first === 1 ? 0 : stack.children.length - first + 1}`);
  syncPileSurface(stack);
};

// The strip behind the front page's crease is the back of the page turned most recently, so it
// paints in that page's paper (see index.astro). That page is the furthest of the pile, which is
// the highest --page-index; its own colour is already on it, lifted by syncStackSurfaces. With
// nothing turned there is no pile, and the strip falls back to the front page's paper under an
// opacity of 0.
const syncPileSurface = (stack: HTMLElement): void => {
  const pages = [...stack.children] as HTMLElement[];
  const furthest = pageIndex(pages[0]) === 1
    ? undefined
    : pages.find((page) => pageIndex(page) === pages.length);
  if (furthest) {
    stack.style.setProperty('--pile-paper', furthest.style.getPropertyValue('--paper-surface'));
  } else {
    stack.style.removeProperty('--pile-paper');
  }
};

// [data-paper-settled] means the front page is lying flat and still: set as a flip or a settle
// hands the rendering back, and dropped the moment a gesture starts moving a page again. Hints
// that point at the page (TechnicalDrawing's way-back callout) wait for it, so their arrow is
// never drawn across a sheet still gliding over.
const settle = (stack: HTMLElement): void => {
  stack.dataset.paperSettled = '';
  // The turn is over, whichever way it went: the page that ended up at the front comes alive
  // here, and a gesture that came back short of committing gets its demo back.
  setStackTurning(stack, false);
};

const unsettle = (stack: HTMLElement): void => {
  delete stack.dataset.paperSettled;
};

// The demos under the paper hold still for the rest of a turn (watchPageActive in
// client/frontPage.ts), from here. Not from the grab: a drag that comes back and settles would
// then have stopped and restarted the Space Builder's WebGL context for nothing. From the
// commit point the turn is going to happen, so what is paused is a page on its way out —
// either it has passed the flap's own threshold (`paper-fold--will-commit`, in onFoldDrag), or
// it is a key, wheel or swipe turn, which decides everything the moment it starts.
//
// Reaching it is one-way for the rest of the gesture. Dragging back below the threshold after
// passing it would otherwise start the demo up again mid-drag, for the second or two until the
// hand makes up its mind — the churn this whole arrangement exists to avoid. A release that
// settles back resumes it at the settle instead.
const commitTurn = (stack: HTMLElement): void => {
  setStackTurning(stack, true);
};

// The one thing on a stack that never stops: index.astro's fold-reveal-pulse, breathing the
// resting dog-ear on a 7.5s loop for as long as the page is open. It animates --fold-x/--fold-y,
// which the front page's crease clip-path reads, so every frame it advances the browser resolves
// style for that page and everything printed on it — a demo's whole interface. One stack costs
// about 1.5ms a frame that way and this page carries six, so better than half a 60fps frame was
// going on dog-ears, including every frame of a turn happening on some other stack.
//
// A tease has no one to tease off screen, so there it holds still. Through the Web Animations
// API rather than a class or a data attribute: a class or an attribute would put the document's
// :has() rules back in play on every scroll past, and the whole-document style resolve that
// follows is exactly what a turn is already paying too much of. A paused animation keeps its
// value, so the dog-ear is where the reader left it when the stack comes back.
const PULSE = 'fold-reveal-pulse';

const stillStacks = new WeakSet<HTMLElement>();

const pulsesOf = (stack: HTMLElement): Animation[] =>
  [...stack.querySelectorAll<HTMLElement>('.paper-front')]
    .flatMap((sheet) => sheet.getAnimations())
    .filter((animation) => (animation as CSSAnimation).animationName === PULSE);

// Re-applies the hold after anything that restarts the pulse — a flip hands it to the next page,
// a settle starts it again. Free on a stack in view, which is the only kind a turn happens on.
const holdPulseOffScreen = (stack: HTMLElement): void => {
  if (!stillStacks.has(stack)) return;
  for (const pulse of pulsesOf(stack)) pulse.pause();
};

const watchStackPulse = (stack: HTMLElement): void => {
  // A margin so the pulse is already running by the time the stack is actually looked at,
  // rather than starting under the reader's eye as it crosses the viewport edge.
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) stillStacks.delete(stack);
      else stillStacks.add(stack);
      for (const pulse of pulsesOf(stack)) {
        if (entry.isIntersecting) pulse.play();
        else pulse.pause();
      }
    }
  }, { rootMargin: '25%' });
  observer.observe(stack);
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
  sheet.style.animationName = `none, ${PULSE}`;
  holdPulseOffScreen(sheet.parentElement!);
};

// What a page that has come to rest at the front hands back: index.astro's own rules take the
// rendering again, with the resting dog-ear running on it.
const restFold = (sheet: HTMLElement, section: HTMLElement, fold: HTMLElement): void => {
  // The dog-ear first, because restarting its pulse means forcing a reflow, and a reflow forced
  // after the class below has come off is one that re-resolves the whole document — the page's
  // :has() rules see to that. Both land in the same frame either way, so the order is free.
  restIdleFold(sheet);
  fold.classList.remove('paper-fold--active');
  clearFoldRender(section, fold);

  sheet.parentElement!.style.removeProperty('--flip-progress');
  // A settled back-drag may have restored the stack's original order
  updateFlippedState(sheet.parentElement!);
  settle(sheet.parentElement!);
};

// Glides back to the resting dog-ear, then hands rendering back to index.astro's idle CSS rules
const settleFold = (sheet: HTMLElement, section: HTMLElement, fold: HTMLElement, thrown = 0): (() => void) => {
  // The glide opens by reading where the fold stands, so it goes first: dropping the commit
  // feedback is a class change, and a read after one costs a whole-document resolve. Settling
  // means no flip is coming, so the feedback still drops in this same frame, just after.
  const glide = glideFoldTip(sheet, section, fold, foldTipFromSize(FOLD_REVEAL_END_PX.x, FOLD_REVEAL_END_PX.y), 1000, thrown, () => {
    restFold(sheet, section, fold);
  });
  fold.classList.remove('paper-fold--will-commit');
  return glide;
};

// The first half of committing a flip: every page's --page-index shifts down one (the splay
// rotation and paint order both follow it, with the rotate transition re-splaying the pages
// around the shared pin), and the paper-front class plus the clip elements move to the new front
// page — handing the class over restarts its fold-reveal animations. The fold itself stays
// behind on the flipped page so finishFlip can fold it back down behind the stack.

// A stack has one flap, and a committed flip keeps it on the outgoing sheet to the very end,
// painting that sheet folding away behind the stack. So the page taking the front got its corner
// cut on time but had nothing folded over the cut — a notch showing the page below rather than a
// dog-ear — until finishFlip handed the flap over, a second or so later. This stands in for it
// meanwhile: same element and so the same idle rules, sized by the reveal like any resting
// dog-ear, and swapped back out for the real flap the moment the flip lets go of it.
const STAND_IN = 'paper-fold--stand-in';

// Puts the stack's turn clock at its starting value with no transition, so the value set right
// after runs the transition from there. Turning the stack's transitions off for the
// reflow is safe: the only other ones there are the corner cut's, which a committed flip has
// long since finished growing.
const restartTurn = (stack: HTMLElement, name: string, from: string): void => {
  stack.style.transition = 'none';
  stack.style.setProperty(name, from);
  void stack.offsetWidth;
  stack.style.transition = '';
};

const standInFold = (): HTMLElement => {
  const standIn = document.createElement('div');
  standIn.className = `paper-fold ${STAND_IN}`;
  return standIn;
};

const restack = (sheet: HTMLElement, fold: HTMLElement): void => {
  const stack = sheet.parentElement!;
  const pages = [...stack.children] as HTMLElement[];
  const under = sheet.querySelector<HTMLElement>('.paper-clip-under')!;
  const clip = sheet.querySelector<HTMLElement>('.paper-clip')!;
  const grab = sheet.querySelector<HTMLElement>('.paper-back-grab')!;
  const hint = sheet.querySelector<HTMLElement>('.paper-flip-hint')!;

  const next = pages.find((page) => pageIndex(page) === 2)!;
  // The incoming page's own paper, lifted before anything below moves a node or changes a class.
  // It is the last computed-style read this function makes, and restartTurn's forced reflow is
  // the last flush: after them come the moves and the classes, and the whole restack costs one
  // document-wide resolve instead of the three it used to (the page's :has() rules put every
  // element back in play on each one). Same colour either way — nothing below touches it.
  syncPaperSurface(next, sectionOf(next));

  // The strip behind the front crease follows this page up to the pile on --turn-ease (see
  // index.astro): back to 0 without a transition, then eased to 1 in the same recalc that
  // renumbers the pages, so it runs on the page's own clock.
  restartTurn(stack, '--turn-ease', '0');
  fold.classList.remove('paper-fold--will-commit');
  // Renumbering starts every page's 250ms drift transition.
  stirLanding(stack);
  for (const page of pages) {
    const index = pageIndex(page);
    page.style.setProperty('--page-index', `${index === 1 ? pages.length : index - 1}`);
  }
  stack.style.removeProperty('--flip-progress');
  stack.style.setProperty('--turn-ease', '1');
  sheet.classList.remove('paper-front');
  // index.astro holds the reveal back half a second so the dog-ear draws itself once the page
  // has loaded, and restarting the animation here brought that wait along: the flip landed on a
  // front page with a square corner, and the dog-ear only turned up once everything else had
  // stopped moving. It has been introduced by now, so start it at once and let it curl up while
  // the sheet it replaces folds away behind the stack. The pulse keeps its own gap after it.
  next.style.animationDelay = '0s, 1s';
  next.classList.add('paper-front');
  // The clip's back bar goes before the page content so the page hides it (see index.astro)
  next.prepend(under);
  next.append(clip, grab, hint);
  // Where index.astro puts the flap: after the clip, so paper dragged over the wire covers it
  next.insertBefore(standInFold(), grab);
  updateFlippedState(stack);
  stack.dataset.paperTurned = '';
  syncInert(stack);
  // The dog-ear's pulse goes with the front-page role, so an off-screen stack has to hold the
  // new page's still too.
  holdPulseOffScreen(stack);
};

// Drops everything the front-page role leaves behind on a sheet, so its next turn at the front
// starts from index.astro's own rules. animationName above all: restIdleFold pins it inline to
// keep the reveal retired, and an inline name that never changes is a name the fold-reveal
// animations can't be restarted under — the page would come back to the front with no dog-ear at
// all, just the flap's 1px border.
const clearFrontFold = (sheet: HTMLElement): void => {
  sheet.style.removeProperty('--fold-x');
  sheet.style.removeProperty('--fold-y');
  // --paper-surface stays: the sheet paints its own back with it in the pile of turned pages,
  // which is exactly where a page leaving the front goes.
  sheet.style.animationName = '';
  sheet.style.animationDelay = '';
};

// The second half: the flipped page's inline fold state is fully cleared — so its next turn at
// the front starts fresh — and the fold rejoins the new front page's companions.
const finishFlip = (sheet: HTMLElement, section: HTMLElement, fold: HTMLElement): void => {
  const stack = sheet.parentElement!;
  fold.classList.remove('paper-fold--active');
  clearFoldRender(section, fold);
  clearFrontFold(sheet);
  // A back-drag's grab squares this sheet up with the front page; letting go of the inline
  // rotation eases it back into the fan.
  sheet.style.rotate = '';
  stack.style.removeProperty('--flip-progress');
  const front = stack.querySelector<HTMLElement>('.paper-front')!;
  // Straight swap when a restack left a stand-in holding the dog-ear, so nothing changes on
  // screen as the real flap arrives. A back-drag laid back down never restacked, and its front
  // page is waiting for its flap where index.astro left it.
  const standIn = front.querySelector<HTMLElement>(`.${STAND_IN}`);
  if (standIn) standIn.replaceWith(fold);
  else front.insertBefore(fold, front.querySelector('.paper-back-grab'));
  settle(stack);
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
  const fold = stack.querySelector<HTMLElement>(`.paper-fold:not(.${STAND_IN})`)!;
  const hint = front.querySelector<HTMLElement>('.paper-flip-hint')!;

  // Renumbering starts every page's 250ms drift transition.
  stirLanding(stack);
  for (const page of pages) {
    const index = pageIndex(page);
    page.style.setProperty('--page-index', `${index === pages.length ? 1 : index + 1}`);
  }
  front.classList.remove('paper-front');
  clearFrontFold(front);
  prev.classList.add('paper-front');
  prev.prepend(under);
  prev.append(clip, fold, hint);
  stack.dataset.paperTurned = '';
  // Coming back is the harder half to find, so it is marked apart from having turned at all.
  stack.dataset.paperReturned = '';
  syncInert(stack);
  // Promoting the originally-first page puts the stack back in its own order, so the corner cut
  // unfolds from here — the mirror of flipFold committing the flipped state as its glide sets
  // off. The clip's wire lies on that corner and is swallowed with it, so leaving the state to
  // the settle meant the clip only reappeared once the page had long since arrived; re-deriving
  // it now runs the cuts' 300ms transition under the page as it comes over, uncovering the wire
  // as the corner it pins flattens out. A release that sends the page back sets the flipped
  // state again on its way (flipFold).
  updateFlippedState(stack);
  syncPaperSurface(prev, sectionOf(prev));
  // The pulse travels with the front-page role; off screen it stays held.
  holdPulseOffScreen(stack);
  return prev;
};

// The handover at the end of a back-drag's approach, with the page lying fully folded over at the
// resting crease: the fold state goes over to the first fold's own parameterization (the same
// state on screen, since the two renderings agree there) and the page takes the front. Reached
// either by dragging the approach out to the end, or by a release that threw it the rest of the
// way (see throwFront).
const promoteFold = (sheet: HTMLElement, section: HTMLElement, fold: HTMLElement, seed: Vec): void => {
  const { w, h } = metricsOf(sheet);
  const backCut = currentBackFoldSize(sheet);
  const size = foldSizeFromTip(seed.x, seed.y);
  sheet.style.setProperty('--fold-x', `${size.x}px`);
  sheet.style.setProperty('--fold-y', `${size.y}px`);
  renderFold(section, fold, w, h, seed, backCut);
  sheet.style.rotate = '';
  bringToFront(sheet.parentElement!);
  sheet.getAnimations().forEach((animation) => animation.cancel());
};

// A back-drag's approach phase: the landing run in reverse, driven by the pointer. Pull along
// the resting crease's normal sets how far the fold has come (s); the pointer's own direction
// steers where the corner heads — the delta's angle off the pull direction swings the corner's
// travel off the seed line by that same angle, so the fold comes over the way it's dragged,
// not just as far. The corner stays on the arc of radius s·|seed| around its home (never flung
// beyond it — deflecting the direction rather than adding a scaled lateral offset is what keeps
// an off-axis drag moving at the same speed as an on-axis one), and the swing eases out as s
// completes so the gesture still ends exactly fully folded. The hindmost page's printed front
// slides out to the page's upper left and doubles
// over blank-back-up as the crease consumes it — exactly how the page went back there,
// retraced. The sheet was squared up with the front page at the grab (see the grab handler),
// so its folded-back corner tracks the front page's throughout. At s 1 the page lies fully
// folded at the resting crease — the very state a forward flip restacks in, its crease
// coinciding with the corner cut every page already wears — so promoting it at that exact
// moment changes nothing on screen: the ordinary unfold drag (onFoldDrag, gain 2) takes over
// seamlessly, with the pointer offset re-derived for continuity.
const onBackApproach = (sheet: HTMLElement, section: HTMLElement, fold: HTMLElement, gesture: FoldGesture, at: Pull) => {
  const approach = gesture.approach!;
  const back = gesture.back!;
  const { w, h } = metricsOf(sheet);
  const { back: backCut, drift } = currentLanding(sheet);
  const delta = { x: at.clientX - back.origin.x, y: at.clientY - back.origin.y };
  const along = delta.x * back.dir.x + delta.y * back.dir.y;
  const s = Math.min(Math.max(along / approach.pull, 0), 1);
  const across = -delta.x * back.dir.y + delta.y * back.dir.x;
  // The floor on along only matters while s is still ~0 (t pinned at home), where it keeps the
  // angle from whipping through ±180° as the delta passes the perpendicular
  const swing = -Math.atan2(across, Math.max(along, 1)) * (1 - s);
  const swung = rotateVec(approach.seed, swing);
  const t = { x: w + swung.x * s, y: h + swung.y * s };
  approach.s = s;
  approach.t = t;
  track(back.trail, { along, time: at.timeStamp });
  // The release's own test, which reads the same pull the approach is driven by, so a hand that
  // has already thrown it far enough is holding a turn that is going to happen (see commitTurn).
  if (along >= backReach(sheet)) commitTurn(sheet.parentElement!);
  renderLanding(section, fold, w, h, approach.seed, backCut, t, drift);
  if (s < 1) return;

  // Fully folded over — promote the page and hand the rest of the gesture to the unfold drag,
  // which drives --fold-x/-y and the first fold's own render from here
  promoteFold(sheet, section, fold, approach.seed);
  gesture.unfoldFrom = approach.seed;
  gesture.approach = null;
  onFoldGrab(sheet, gesture, at);
  // The unfold takes over with the tip standing at the seed; seeding its trail from there means
  // the very next move already carries a speed, so a page flicked over and straight on out
  // doesn't have to wait for a second unfold sample before the throw counts.
  track(gesture.trail, { tip: approach.seed, time: at.timeStamp });
};

// A committed flip: glide the tip the rest of the way out to the resting seed — the page
// flipped all the way over to its upper left, the crease pivoting around the pin to the
// resting angle as the fold completes. Only that crease lets the page lie flat behind the
// stack wearing the same folded-back corner as every flipped page; finishing on any other rim
// crease would land it folded along a line the resting state contradicts. Restacking happens
// there, and from there the landing (renderLanding) folds the sheet back down from the
// extreme, before its fold state is cleared for good.
const flipFold = (sheet: HTMLElement, section: HTMLElement, fold: HTMLElement, thrown: number): (() => void) => {
  const sheetMetrics = metricsOf(sheet);
  const { w: width, h: height } = sheetMetrics;
  const to = restSeed(sheetMetrics);

  // Both halves — folding out to the resting seed, then the landing back down behind the stack —
  // run on one clock, measured in crease travel (the edge the eye follows: the first fold's
  // crease rides half the tip's path out, the landing's sweeps half the seed back in), under a
  // single ease-out. The crease keeps its speed straight through the restack instead of settling
  // to a stop at the seed and setting off again, so the flip reads as one released motion.
  //
  // Where the fold stands is read before the two attributes below are written, not after: an
  // attribute write puts the document's :has() rules back in play, and the read would then have
  // to resolve every element on the page before it could answer.
  const { x: fx, y: fy } = currentFoldSize(sheet);

  // The flip is committed, so a first flip grows every page's corner cut now — the glide out to
  // the seed outlasts the cuts' 300ms transition, which would otherwise still be mid-growth
  // while the landing folds material in behind it. A re-grab that settles instead re-derives
  // the flipped state from the page order (settleFold), shrinking the cuts back.
  stirLanding(sheet.parentElement!);
  sheet.parentElement!.dataset.paperFlipped = '';
  // A key press flips without a drag, so the page is only now known to be on the move
  unsettle(sheet.parentElement!);
  // Nothing can call this off now, whether a hand let go past the threshold or a key asked for
  // the turn outright, so the demo on the paper stops here if it hasn't already.
  commitTurn(sheet.parentElement!);

  const from = foldTipFromSize(fx, fy);
  const d1 = Math.hypot(to.x - from.x, to.y - from.y) / 2;
  const d2 = Math.hypot(to.x, to.y) / 2;
  const total = d1 + d2;
  // Weight the duration by the travel left at release: an early let-go, with most of the flip
  // still ahead of it, takes proportionally longer instead of hitting a cap and launching at
  // full tilt, so the ease-out's opening speed stays roughly the same wherever the hand lets go —
  // unless the hand let go faster than that, in which case the flip sets off at the speed it was
  // thrown at. The crease covers half the ground the tip does, so the throw reaches it halved.
  const duration = Math.max(Math.min(300 + total / 2, 1400, coastMs(total, thrown / 2)), 200);
  const home = { x: width, y: height };

  let settling = false;
  let frame = 0;
  const start = performance.now();
  const step = (now: number) => {
    const tt = Math.min(Math.max((now - start) / duration, 0), 1);
    const p = (1 - (1 - tt) ** 3) * total;
    // The corner cut and the drift are read at the top of the frame, while style is still clean
    // from the last paint, then everything writes — same discipline as the other per-frame loops.
    // The drift especially: the frame that restacks writes a dozen classes, attributes and moved
    // nodes, and reading it afterwards (as the landing call below used to) made that one frame
    // resolve the whole document twice over.
    const { back: backCut, drift } = currentLanding(sheet);
    if (p < d1) {
      const k = p / d1;
      const tip = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
      const size = foldSizeFromTip(tip.x, tip.y);
      sheet.style.setProperty('--fold-x', `${size.x}px`);
      sheet.style.setProperty('--fold-y', `${size.y}px`);
      renderFold(section, fold, width, height, tip, backCut);
    } else {
      if (!settling) {
        settling = true;
        const size = foldSizeFromTip(to.x, to.y);
        sheet.style.setProperty('--fold-x', `${size.x}px`);
        sheet.style.setProperty('--fold-y', `${size.y}px`);
        restack(sheet, fold);
      }
      const k = (p - d1) / d2;
      const t = { x: home.x + to.x * (1 - k), y: home.y + to.y * (1 - k) };
      renderLanding(section, fold, width, height, to, backCut, t, drift);
    }
    if (tt < 1) {
      frame = requestAnimationFrame(step);
      return;
    }
    finishFlip(sheet, section, fold);
  };
  frame = requestAnimationFrame(step);

  // A re-grab mid-fold-back-down fast-forwards to the settled end state; before the restack the
  // fold is still the front page's, and the grab simply takes it over where it stands.
  return () => {
    cancelAnimationFrame(frame);
    if (settling) finishFlip(sheet, section, fold);
  };
};

// The mirror of flipFold, for a page fetched back by a gesture with nothing left to let go of:
// the previous page comes over the clip and then unfolds flat in front. Both halves run on one
// clock under a single ease-out, measured in crease travel the way flipFold's are, so the edge
// the eye follows keeps its speed straight through the promotion. Run as two glides instead (an
// approach easing out to a stop, then a settle setting off again from it) the page visibly halts
// half way through the turn. A release still goes that way, since the hand decides there how far
// it had got and how fast; a key press has decided everything already.
const bringFold = (
  sheet: HTMLElement, section: HTMLElement, fold: HTMLElement,
  approach: NonNullable<FoldGesture['approach']>, onPromoted: () => void,
): (() => void) => {
  const { w, h } = metricsOf(sheet);
  unsettle(sheet.parentElement!);
  // Its caller only ever commits, so the same as flipFold: the demos hold still from here.
  commitTurn(sheet.parentElement!);
  const { seed } = approach;
  const over = { x: w + seed.x, y: h + seed.y };
  const rest = foldTipFromSize(FOLD_REVEAL_END_PX.x, FOLD_REVEAL_END_PX.y);
  const from = approach.t;
  const d1 = Math.hypot(over.x - from.x, over.y - from.y) / 2;
  const d2 = Math.hypot(seed.x - rest.x, seed.y - rest.y) / 2;
  const total = d1 + d2;
  const duration = Math.max(Math.min(300 + total / 2, 1400), 200);

  let promoted = false;
  const promote = () => {
    promoted = true;
    promoteFold(sheet, section, fold, seed);
    onPromoted();
  };

  let frame = 0;
  const start = performance.now();
  const step = (now: number) => {
    const tt = Math.min(Math.max((now - start) / duration, 0), 1);
    const p = (1 - (1 - tt) ** 3) * total;
    const { back: backCut, drift } = currentLanding(sheet);
    if (p < d1) {
      const k = p / d1;
      const t = { x: from.x + (over.x - from.x) * k, y: from.y + (over.y - from.y) * k };
      renderLanding(section, fold, w, h, seed, backCut, t, drift);
    } else {
      if (!promoted) promote();
      const k = (p - d1) / d2;
      const tip = { x: seed.x + (rest.x - seed.x) * k, y: seed.y + (rest.y - seed.y) * k };
      const size = foldSizeFromTip(tip.x, tip.y);
      sheet.style.setProperty('--fold-x', `${size.x}px`);
      sheet.style.setProperty('--fold-y', `${size.y}px`);
      renderFold(section, fold, w, h, tip, backCut);
    }
    if (tt < 1) {
      frame = requestAnimationFrame(step);
      return;
    }
    restFold(sheet, section, fold);
  };
  frame = requestAnimationFrame(step);

  // The turn was committed when the key landed, so a re-grab mid-flight takes the page as
  // arrived rather than undoing it: fast-forward to the end state and let the new gesture start
  // from a stack at rest.
  return () => {
    cancelAnimationFrame(frame);
    if (!promoted) promote();
    restFold(sheet, section, fold);
  };
};

const shouldFlip = (sheet: HTMLElement, coast: Vec | null): boolean => {
  const { w: width, h: height } = metricsOf(sheet);
  const { x: fx, y: fy } = currentFoldSize(sheet);
  return pointFolded(commitPoint(width, height), width, height, coast ?? foldTipFromSize(fx, fy));
};

const releaseFold = (sheet: HTMLElement, section: HTMLElement, fold: HTMLElement, canceled: boolean, thrown: Throw | null): (() => void) => {
  // A grab that never dragged left the animations alone, so there is nothing to hand back
  if (sheet.style.getPropertyValue('--fold-x') === '') return () => {};

  const speed = thrown ? thrown.speed : 0;
  const hasBack = sheet.parentElement!.childElementCount > 1;
  if (!canceled && hasBack && shouldFlip(sheet, thrown?.at ?? null)) return flipFold(sheet, section, fold, speed);
  return settleFold(sheet, section, fold, speed);
};

// Keeps --fold-page-w/-h in sync with each page's actual pixel size — the generalized clip-path
// formula in index.astro needs a real length to divide by (percentages aren't real lengths until
// layout, so they can't be used in that arithmetic). Every page is observed, not just the
// current front, since flips move the front-page role around. The cached metrics refresh here
// too, resizes being what moves them; each gesture's grab re-samples as well (onFoldGrab), for
// anything that shifts the em-based pin without changing the page's pixel size.
const observeFoldPageSizes = (stack: HTMLElement): void => {
  // Every page's readings before any page's writes (see lengthsOf): interleaved, each write
  // made the browser redo style before the next page's read, once per page per resize.
  const observer = new ResizeObserver((entries) => {
    // A resize re-derives the corner cut, which is written in em: the kept landing reading goes
    // stale here with no transition to announce it.
    stirLanding(stack);
    const pages = entries.map((entry) => {
      const page = entry.target as HTMLElement;
      sampleMetrics(page, entry.contentRect);
      const { width, height } = entry.contentRect;
      return { page, width, height };
    });
    for (const { page, width, height } of pages) {
      page.style.setProperty('--fold-page-w', `${width}px`);
      page.style.setProperty('--fold-page-h', `${height}px`);
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
  // The one thing that doesn't move: pages take turns at the front, but they are always its
  // children.
  const stack = sheet.parentElement!;

  syncPaperSurface(sheet, section);
  const clearTease = attachBackFoldTease(stack, () => gesture !== null);

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

    gesture = {
      pointerId: e.pointerId, offset: { x: 0, y: 0 }, theta: 0, size: { x: 0, y: 0 }, gain: 1, canceled: false,
      grabAt: { x: 0, y: 0 }, unfoldFrom: null, approach: null, back: null, trail: [],
    };
    onFoldGrab(sheet, gesture, e);
    try {
      fold.setPointerCapture(e.pointerId);
    } catch {
      gesture = null;
      cancelSettle = releaseFold(sheet, section, fold, true, null);
    }
  });

  fold.addEventListener('pointermove', (e) => {
    const active = gesture;
    if (active === null || e.pointerId !== active.pointerId) return;
    if (!fold.hasPointerCapture(e.pointerId)) return;
    if (e.buttons === 0) {
      fold.releasePointerCapture(e.pointerId);
      return;
    }
    onFoldDrag(sheet, section, fold, active, e);
    // The drag strayed too far past the fold's reach and gave up; dropping the capture is what
    // ends it, and the release settles the fold back.
    if (active.canceled) fold.releasePointerCapture(e.pointerId);
  });

  // Pointer capture is released — on pointerup *or* pointercancel — right before this fires, so
  // it's the one place that decides what the released fold does: flip onto the back of the
  // stack, or settle back to its resting size.
  fold.addEventListener('lostpointercapture', (e) => {
    if (gesture === null || e.pointerId !== gesture.pointerId) return;
    const { canceled, trail } = gesture;
    gesture = null;
    cancelSettle = releaseFold(sheet, section, fold, canceled, coastTip(trail, e.timeStamp));
  });

  // A back-drag released before its approach completed: the landing resumes from where the
  // reverse sweep stood, laying the previous page back down flat behind the stack, and the
  // front page gets its flap and resting dog-ear back — the stack exactly as the grab found it.
  const returnBehind = (approach: NonNullable<FoldGesture['approach']>): (() => void) => {
    let done = false;
    const front = sheet.parentElement!.querySelector<HTMLElement>('.paper-front')!;
    const { w, h } = metricsOf(sheet);
    const home = { x: w, y: h };
    const finish = () => {
      done = true;
      finishFlip(sheet, section, fold);
      restIdleFold(front);
    };
    const cancelGlide = glideLanding(sheet, section, fold, approach.seed, approach.t, home, 400, finish);
    return () => {
      cancelGlide();
      if (!done) finish();
    };
  };

  // The other way a released approach can go: thrown hard enough (see thrownOverFront), the
  // corner finishes its flight out to the fully-folded seed on the release's own momentum, and
  // the page is promoted there and settles flat as the new front page — the gesture the hand
  // started, carried out by the throw.
  const throwFront = (approach: NonNullable<FoldGesture['approach']>): (() => void) => {
    const { w, h } = metricsOf(sheet);
    const tip = { x: w + approach.seed.x, y: h + approach.seed.y };
    let done = false;
    let cancelSettleFold: () => void = () => {};
    const finish = () => {
      done = true;
      promoteFold(sheet, section, fold, approach.seed);
      // Same hand-back as an unfold's own release: the grab handle sat out the promotion, and
      // rejoins the sheet it now belongs to.
      sheet.insertBefore(grab, sheet.querySelector('.paper-flip-hint'));
      cancelSettleFold = settleFold(sheet, section, fold);
    };
    const cancelGlide = glideLanding(sheet, section, fold, approach.seed, approach.t, tip, 400, finish);
    return () => {
      cancelGlide();
      if (!done) finish();
      cancelSettleFold();
    };
  };

  // Going back a page runs in two phases. First the approach: grabbing the folded-back corner
  // moves only the fold flap onto the hindmost page — which stays behind the stack — so
  // nothing snaps into place; dragging folds it progressively over the clip (onBackApproach).
  // The moment it has come fully over it is promoted, and the same drag machinery as the
  // forward fold unfolds it from there. Both phases are one pull though, and the release
  // measures that: dragged its quarter of the way to the opposite corner (BACK_COMMIT_REACH) the
  // page stays as the new front page, short of it it goes back where it came from — whether the
  // hand let go during the approach or after it.
  // Sets the stack up for a back-drag and returns the gesture it starts, ready for whatever is
  // driving it (a pointer on the grab handle, a horizontal scroll) to take over. Null when there
  // is no previous page to go back to.
  const beginBack = (at: Pull, pointerId: number): FoldGesture | null => {
    if (!('paperFlipped' in stack.dataset)) return null;

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

    const sheetMetrics = sampleMetrics(sheet);
    stirLanding(stack);
    const { w, h } = sheetMetrics;
    // Read before the node move and the class below: both put the document's :has() rules back
    // in play, and a read after them resolves every element on the page.
    const { back: backCut, drift } = currentLanding(sheet);
    sheet.append(fold);
    fold.classList.add('paper-fold--active');
    unsettle(stack);
    // Active mode sizes the flap to the whole page, and the idle clip-path it still carries fills
    // that box — a page-sized slab of flap colour on a sheet whose top-left corner shows through
    // the front page's cut. Render the reverse landing's flat start now so it begins hidden.
    const seed = restSeed(sheetMetrics);
    renderLanding(section, fold, w, h, seed, backCut, { x: w, y: h }, drift);
    // The pull direction: the resting crease's normal, which the seed lies opposite along
    const seedLength = Math.hypot(seed.x, seed.y);
    const dir = { x: -seed.x / seedLength, y: -seed.y / seedLength };

    // The arriving page squares up with the front one for the whole gesture (the rotate
    // transition eases it there), so their folded-back corners stay flush as it comes over —
    // the same reason holdUnsplayed closes the fan behind them.
    sheet.style.rotate = '0deg';
    holdUnsplayed(sheet);

    return {
      pointerId, offset: { x: 0, y: 0 }, theta: 0, size: { x: 0, y: 0 }, gain: 2, canceled: false,
      grabAt: { x: at.clientX, y: at.clientY },
      unfoldFrom: null,
      approach: { seed, pull: seedLength * BACK_APPROACH_PULL, s: 0, t: { x: w, y: h } },
      back: { origin: { x: at.clientX, y: at.clientY }, dir, trail: [] },
      trail: [],
    };
  };

  // What a back-drag's release does, from either phase: committed (its pull thrown a third of the
  // way to the opposite corner) the page stays in front — carried the rest of the way over first
  // if it hasn't got there — and short of that it goes back where it came from.
  const releaseBack = (ended: FoldGesture, time: number): (() => void) => {
    const { approach, back, trail } = ended;
    const committed = backThrow(back!, time) >= backReach(sheet);
    if (approach) return committed ? throwFront(approach) : returnBehind(approach);
    // The grab handle sat out the promotion so the DOM move couldn't break its pointer
    // capture; with the gesture over it rejoins its sheet, back in canonical sibling order.
    sheet.insertBefore(grab, sheet.querySelector('.paper-flip-hint'));
    // The tip's own throw doesn't decide anything here, but it still carries the speed the glide
    // that takes over sets off at.
    const speed = coastTip(trail, time)?.speed ?? 0;
    return committed
      ? settleFold(sheet, section, fold, speed)
      : flipFold(sheet, section, fold, speed);
  };

  grab.addEventListener('pointerdown', (e) => {
    if (gesture !== null || e.button !== 0 || !e.isPrimary) return;
    const started = beginBack(e, e.pointerId);
    if (!started) return;
    e.preventDefault();
    e.stopPropagation();
    gesture = started;
    try {
      grab.setPointerCapture(e.pointerId);
    } catch {
      const { approach } = gesture;
      gesture = null;
      cancelSettle = returnBehind(approach!);
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
      onFoldDrag(sheet, section, fold, gesture, e);
    }
  });

  // Unlike the forward drag, a canceled back-drag shouldn't force a settle — straying past the
  // grace margin lets go with the fold still near-fully folded, and the pull's own threshold
  // already resolves that to "return to the back", which is what canceling should mean here.
  grab.addEventListener('lostpointercapture', (e) => {
    if (gesture === null || e.pointerId !== gesture.pointerId) return;
    const ended = gesture;
    gesture = null;
    cancelSettle = releaseBack(ended, e.timeStamp);
  });

  // Taking the stack sideways turns its pages, whether that's a wheel, a trackpad or a finger.
  // The travel walks a point of its own along the line the matching drag would have taken — out
  // from the fold's tip to take the page away, down the back-drag's pull to fetch the one behind
  // it — and everything downstream is the drag's: the same fold under the same clamps, the same
  // commit showing on the flap, the same release. Sideways is the way the pages themselves
  // travel, so taking the stack left sends the page away and right brings the last one back. The
  // gesture is given a pointer id no real pointer can have, so a stray pointer event can't be
  // mistaken for part of it.
  let swipe: {
    at: Vec, dir: Vec,
    // Where the scrolling has got to, and where the fold has eased to behind it (see
    // followScroll). A finger keeps the two together; a wheel is what pulls them apart.
    target: number, travel: number,
    idle: number, last: number,
    // The easing's rAF handle, the time of its last frame and the constant it closes the gap on,
    // and the flag the idle wait sets to say the wheel has fallen quiet — the gesture then ends
    // as soon as the fold has caught up with it.
    frame: number, painted: number, ease: number, quiet: boolean,
  } | null = null;

  const restingSwipe = (at: Vec, dir: Vec) => ({
    at, dir, target: 0, travel: 0, idle: 0, last: 0,
    frame: 0, painted: 0, ease: SCROLL_SMOOTH_MAX, quiet: false,
  });

  const beginSwipe = (forward: boolean, time: number): boolean => {
    cancelSettle();
    clearTease();
    if (!forward) {
      const box = grab.getBoundingClientRect();
      const at = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
      const started = beginBack({ clientX: at.x, clientY: at.y, timeStamp: time }, -1);
      // Nothing behind the front page to come back to
      if (!started) return false;
      gesture = started;
      swipe = restingSwipe(at, started.back!.dir);
      return true;
    }
    sheet = fold.parentElement!;
    section = sectionOf(sheet);
    syncPaperSurface(sheet, section);
    const box = sheet.getBoundingClientRect();
    const { x: foldX, y: foldY } = currentFoldSize(sheet);
    const tip = foldTipFromSize(foldX, foldY);
    const at = { x: box.right + tip.x, y: box.bottom + tip.y };
    const diagonal = Math.hypot(box.width, box.height);
    gesture = {
      pointerId: -1, offset: { x: 0, y: 0 }, theta: 0, size: { x: 0, y: 0 }, gain: 1, canceled: false,
      grabAt: { x: 0, y: 0 }, unfoldFrom: null, approach: null, back: null, trail: [],
    };
    onFoldGrab(sheet, gesture, { clientX: at.x, clientY: at.y, timeStamp: time });
    swipe = restingSwipe(at, { x: -box.width / diagonal, y: -box.height / diagonal });
    return true;
  };

  const swipeTo = (travel: number, time: number) => {
    const held = swipe!.travel;
    swipe!.travel = Math.max(travel, 0);
    const reach = swipe!.travel * (gesture!.back ? 1 : SWIPE_AWAY_GAIN);
    const at = {
      clientX: swipe!.at.x + swipe!.dir.x * reach,
      clientY: swipe!.at.y + swipe!.dir.y * reach,
      timeStamp: time,
    };
    if (gesture!.approach) {
      onBackApproach(sheet, section, fold, gesture!, at);
    } else {
      onFoldDrag(sheet, section, fold, gesture!, at);
    }
    if (gesture!.canceled) {
      // A swipe can't stray off the fold the way a drag can — it only ever runs along the one
      // line — so carrying on past the paper's reach holds the fold at its rim instead of giving
      // the gesture up, and the travel keeps the position it can still honour. The scrolling is
      // brought back to it too, so the easing isn't left chasing somewhere the paper can't go.
      gesture!.canceled = false;
      swipe!.travel = held;
      swipe!.target = held;
    }
  };

  // A wheel with detents hands over its travel in lumps, a notch at a time, and a fold that
  // snapped to each one moved in steps rather than moving. So the fold eases after the scrolling
  // instead of matching it: every frame it closes the same fraction of whatever gap is left, on a
  // constant taken from the scrolling's own pace (see SCROLL_SMOOTH_GAP). Where the events are
  // already close together — a trackpad — that constant is a frame or two and the easing can't be
  // seen; where they arrive a notch apart it spreads each lump across the wait for the next one,
  // which is what turns a row of steps back into a movement. The wheel falling quiet doesn't end
  // the gesture on its own: the fold has to have caught up first, so the release measures where
  // the scrolling actually got to and not wherever the easing had reached.
  const followScroll = (now: number) => {
    const live = swipe;
    if (!live) return;
    // A frame that arrives after a long stall (a hidden tab) shouldn't close the whole gap at once
    const span = Math.min(now - live.painted, 100);
    live.painted = now;
    const gap = live.target - live.travel;
    if (Math.abs(gap) >= 0.5) {
      swipeTo(live.travel + gap * (1 - Math.exp(-span / live.ease)), now);
    } else {
      if (live.travel !== live.target) swipeTo(live.target, now);
      if (live.quiet) {
        endSwipe(now);
        return;
      }
    }
    live.frame = requestAnimationFrame(followScroll);
  };

  const endSwipe = (time: number) => {
    const ended = gesture;
    if (swipe) {
      clearTimeout(swipe.idle);
      cancelAnimationFrame(swipe.frame);
    }
    swipe = null;
    gesture = null;
    if (!ended) return;
    cancelSettle = ended.back
      ? releaseBack(ended, time)
      : releaseFold(sheet, section, fold, ended.canceled, coastTip(ended.trail, time));
  };

  // Ends a gesture nothing is going to let go of, by committing it where it stands and leaving
  // the release's own glide to play the whole turn out.
  const commitSwipe = (time: number) => {
    const { approach } = gesture!;
    // Arming the forward fold without moving it: a drag's first move is what hands the page's
    // rendering to the flap and retires the resting dog-ear's animations, so the flip glides on
    // from the dog-ear rather than jumping. A back-drag's grab (beginBack) has already done that.
    if (!approach) swipeTo(0, time);
    gesture = null;
    swipe = null;
    cancelSettle = approach
      // The grab handle sits out the promotion the way it does under a pointer, and rejoins the
      // sheet it now belongs to.
      ? bringFold(sheet, section, fold, approach, () => {
        sheet.insertBefore(grab, sheet.querySelector('.paper-flip-hint'));
      })
      : flipFold(sheet, section, fold, 0);
  };

  stack.addEventListener('wheel', (e) => {
    // A pointer already working the fold owns it until it lets go
    if (gesture !== null && swipe === null) return;
    // Lines and pages only reach here from wheels that report in them; a trackpad's own units are
    // already the pixels the fold is measured in.
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? sheet.clientHeight : 1;
    const sideways = e.deltaX * unit;
    const upright = Math.abs(e.deltaY * unit);
    if (swipe === null) {
      // Starting one takes a scroll that is mostly sideways. Scrolling right takes the content
      // left, which is the way the page leaves.
      if (Math.abs(sideways) <= upright) return;
      if (!beginSwipe(sideways > 0, e.timeStamp)) return;
    } else if (sideways === 0) {
      // Nothing sideways in it at all — the page's own scrolling, which the gesture has no claim
      // on and which doesn't keep it alive either
      return;
    }
    // Once underway the gesture takes whatever sideways an event has in it, however much upright
    // came along: scrolling slowly wobbles off the horizontal, and dropping those events on the
    // ratio starved the gesture of the very travel it was being given. It only claims the event
    // outright while sideways is what it is mostly made of, so a deliberate scroll down mid-
    // gesture still scrolls the page.
    if (Math.abs(sideways) >= upright) e.preventDefault();

    // The scroll moves its own target and the fold eases after it (followScroll), so a wheel's
    // lump lands as a movement rather than a jump. Each gesture counts the scroll running its own
    // way as progress, so reversing the wheel walks the fold back the way it came rather than
    // driving it further over.
    swipe!.target = Math.max(swipe!.target + (gesture!.back ? -sideways : sideways) * SCROLL_GAIN, 0);

    // Both the easing's constant and how long to wait before calling the gesture over follow how
    // this scroll is arriving (see SCROLL_SMOOTH_GAP and SCROLL_IDLE_GAPS); until a second event
    // there is no pace to read, so it waits the longest it ever would rather than cut off a
    // scroll that merely started slowly.
    const gap = swipe!.last === 0 ? SCROLL_IDLE_MAX : e.timeStamp - swipe!.last;
    swipe!.last = e.timeStamp;
    swipe!.ease = Math.min(Math.max(gap * SCROLL_SMOOTH_GAP, SCROLL_SMOOTH_MIN), SCROLL_SMOOTH_MAX);
    swipe!.quiet = false;
    if (swipe!.painted === 0) {
      swipe!.painted = e.timeStamp;
      swipe!.frame = requestAnimationFrame(followScroll);
    }
    clearTimeout(swipe!.idle);
    // Falling quiet doesn't release on its own — followScroll does, once the fold has caught up.
    // Either way the release is timed from the quiet rather than from the last event, so the
    // throw window has closed on the scrolling and the commit is read where it actually left the
    // fold. That is the honest reading here: a flick's momentum arrives as scroll events of its
    // own, so it is already in the travel, and coasting it again would spend it twice. (A finger
    // has a real release, and its throw counts — see below.)
    swipe!.idle = window.setTimeout(
      () => { if (swipe) swipe.quiet = true; },
      Math.min(Math.max(gap * SCROLL_IDLE_GAPS, SCROLL_IDLE_MIN), SCROLL_IDLE_MAX),
    );
  }, { passive: false });

  // Arrow keys turn the page as the same gesture a swipe drives, committed on the spot: a key
  // press has no hand still on the paper to wait for, and what it asks for is settled the moment
  // it lands. Handing the gesture a swipe's worth of travel to ease in first (as this did) left
  // the fold standing there for a second with the turn already decided. Only the stack itself
  // listens, so arrows inside a demo's own controls stay theirs, and a lone page has nowhere to
  // turn to.
  stack.addEventListener('keydown', (e) => {
    if (e.target !== stack || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
    if (gesture !== null || stack.childElementCount < 2) return;
    if (!beginSwipe(e.key === 'ArrowRight', e.timeStamp)) return;
    e.preventDefault();
    commitSwipe(e.timeStamp);
  });

  // A finger never reaches the wheel: swiping the stack scrolls without a scroll event, so it
  // drives the same gesture from the pointer directly, the swipe's own distance standing in for
  // the wheel's travel. touch-action: pan-y (index.astro) leaves the page's own scrolling to the
  // browser, which takes the gesture back — pointercancel — the moment it decides the finger
  // meant to scroll after all. The first few pixels are spent deciding which way the swipe runs
  // and aren't paid out to the fold, so it starts from rest rather than jumping.
  let touch: { id: number, from: Vec } | null = null;

  stack.addEventListener('pointerdown', (e) => {
    if (gesture !== null || touch !== null || e.pointerType === 'mouse') return;
    touch = { id: e.pointerId, from: { x: e.clientX, y: e.clientY } };
  });

  stack.addEventListener('pointermove', (e) => {
    if (touch === null || e.pointerId !== touch.id) return;
    const sideways = e.clientX - touch.from.x;
    if (swipe === null) {
      const upright = e.clientY - touch.from.y;
      // Whichever way the finger commits to first decides the gesture, so the choice is made on
      // the first few pixels of travel in either direction rather than waiting for sideways ones
      // that may never come.
      if (Math.abs(sideways) < SWIPE_START && Math.abs(upright) < SWIPE_START) return;
      // Gone further up or down than sideways, the finger means to scroll the page, and
      // touch-action: pan-y (index.astro) has already let the browser start doing it — a scroll
      // under way can't be called off (see the touchmove handler below, which only gets the
      // chance while it is still cancelable). So the swipe stands down for the rest of this
      // touch, rather than folding a page over underneath a scroll.
      if (Math.abs(sideways) <= Math.abs(upright)) {
        touch = null;
        return;
      }
      // Swiping left carries the page off to the left, the way it goes
      if (!beginSwipe(sideways < 0, e.timeStamp)) {
        touch = null;
        return;
      }
      try {
        stack.setPointerCapture(e.pointerId);
      } catch { /* the finger is gone already; the release below still tidies up */ }
    }
    e.preventDefault();
    // A finger arrives already smooth, and standing where it puts the paper is the whole point of
    // touching it — so it drives the fold outright and the easing has nothing to do.
    const along = (gesture!.back ? sideways : -sideways) - SWIPE_START;
    swipe!.target = along * SCROLL_GAIN;
    swipeTo(swipe!.target, e.timeStamp);
  });

  // Pointer events have no say over scrolling — preventDefault on a pointermove is ignored, and
  // touch-action can only be read at the moment the finger lands, which is before anyone knows
  // what the finger is for. So the page is held still from the touch stream instead, which is
  // where a scroll can still be called off: while any gesture owns the finger — the flap's drag,
  // the back-drag's, or a swipe — every move it makes is cancelled here, and the page stays put
  // for as long as the paper is being worked. Pointer events for a touch are dispatched ahead of
  // the touch events they came from, so the gesture the pointermove handlers above start is
  // already in place by the time the matching touchmove arrives. Once the browser has committed
  // to a scroll of its own it stops asking (cancelable false) and there is nothing to do but let
  // it have the gesture — which is why the swipe declines a finger that set off upright.
  stack.addEventListener('touchmove', (e) => {
    if (gesture !== null && e.cancelable) e.preventDefault();
  }, { passive: false });

  const liftTouch = (e: PointerEvent) => {
    if (touch === null || e.pointerId !== touch.id) return;
    touch = null;
    if (swipe) endSwipe(e.timeStamp);
  };
  // On the window, not the stack: a finger has implicit capture, so its lift always reaches
  // the stack, but a pen has none until a swipe takes capture (above), and a pen pressed on
  // the stack, moved less than SWIPE_START and lifted off it delivers its pointerup elsewhere.
  // With the listener on the stack that left `touch` set and every later swipe returning at
  // the pointerdown check, for the rest of the session.
  window.addEventListener('pointerup', liftTouch);
  window.addEventListener('pointercancel', liftTouch);
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
    // The pile's reach, transitioned on the stack so the strip behind the crease climbs with it.
    '--pile-rise', '--pile-drift',
    // A turned page's own step out, transitioned on the page so its cut, band and translate
    // climb together.
    '--turned-drift', '--turned-rise',
  ]) {
    registerProperty({ name, syntax: '<length>', inherits: true, initialValue: '0px' });
  }
  registerProperty({ name: '--pile-lean', syntax: '<angle>', inherits: true, initialValue: '0deg' });
  registerProperty({ name: '--page-index', syntax: '<number>', inherits: true, initialValue: '1' });
  registerProperty({ name: '--flip-progress', syntax: '<number>', inherits: true, initialValue: '0' });
  // The strip's turn clock (see --pile-rise in index.astro): at rest by default.
  registerProperty({ name: '--turn-ease', syntax: '<number>', inherits: true, initialValue: '1' });
};

export function initPaperStackFold(): void {
  const run = () => {
    registerFoldProperties();
    for (const stack of document.querySelectorAll<HTMLElement>('[data-paper-stack-root]')) {
      const fold = stack.querySelector<HTMLElement>('.paper-fold');
      const grab = stack.querySelector<HTMLElement>('.paper-back-grab');
      const hint = stack.querySelector<HTMLElement>('.paper-flip-hint');
      if (!fold || !grab) continue;
      if (hint) hintOf.set(fold, hint);
      // Only the scripted stack turns pages by keyboard; without JS it is a scroll row.
      stack.tabIndex = 0;
      stack.setAttribute('aria-roledescription', 'paper stack');
      stack.setAttribute('aria-description', 'The left and right arrow keys turn the pages');
      observeFoldPageSizes(stack);
      attachFoldDrag(fold, grab);
      syncStackSurfaces(stack);
      syncInert(stack);
      watchStackPulse(stack);
    }
    watchThemePaperSurface();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
}
