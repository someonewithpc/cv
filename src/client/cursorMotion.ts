/**
 * Moves a drawn cursor the way a hand moves a mouse. A hop's duration grows with its
 * distance, the speed eases in and out with a soft arrival, long moves bow slightly off
 * the straight line, and the tip settles with a small overshoot before it comes to rest.
 * The path is sampled into Web Animations keyframes, so each hop has its own duration
 * and no CSS transition needs to know the distance ahead of time.
 *
 * Positions are in pixels inside the cursor's offset parent. The element's own hotspot
 * offset, if any, is given as percentages of its box and folded into every keyframe.
 */
export type Point = { x: number; y: number };

export type CursorMotionOptions = {
  /** Where the tip sits in the element's box, as fractions; the top left corner by default. */
  hotspot?: Point;
  /** Shortest and longest hop, in ms. */
  minMs?: number;
  maxMs?: number;
  /** How much a hop lengthens per pixel travelled, in ms. */
  msPerPx?: number;
  /** Hops shorter than this go straight; longer ones bow off the line. */
  curveFromPx?: number;
  /** How far the path bows on a long hop, as a fraction of its length, and its cap. */
  curveRatio?: number;
  curveMaxPx?: number;
  /** Farthest the tip overshoots the target before settling, in px. */
  overshootMaxPx?: number;
};

const DEFAULTS: Required<CursorMotionOptions> = {
  hotspot: { x: 0, y: 0 },
  minMs: 260,
  maxMs: 1000,
  msPerPx: 1.25,
  curveFromPx: 120,
  curveRatio: 0.1,
  curveMaxPx: 36,
  overshootMaxPx: 3,
};

/** Cubic ease in and out: a slow start, a fast middle, and a run-out into the target. */
function ease(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
}

/** A bump that rises from zero after `from` and is back at zero at 1. */
function settle(t: number, from: number) {
  if (t <= from) return 0;
  return Math.sin(Math.PI * ((t - from) / (1 - from)));
}

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function hopDuration(distance: number, options: CursorMotionOptions = {}) {
  const { minMs, maxMs, msPerPx } = { ...DEFAULTS, ...options };
  return Math.min(maxMs, Math.max(minMs, 200 + distance * msPerPx));
}

/**
 * The points a hop passes through, from `from` to `to`, evenly spaced in time. A
 * quadratic curve through a control point set off the midpoint gives the bow; the
 * settle adds a few pixels past the target along the direction of travel and takes
 * them back before the last sample.
 */
export function hopPath(from: Point, to: Point, options: CursorMotionOptions = {}) {
  const { curveFromPx, curveRatio, curveMaxPx, overshootMaxPx } = { ...DEFAULTS, ...options };
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const duration = hopDuration(distance, options);
  const samples = Math.max(8, Math.min(72, Math.round(duration / 14)));

  const along = distance > 0 ? { x: dx / distance, y: dy / distance } : { x: 0, y: 0 };
  // The bow goes to the same side for the same direction of travel, so hops read as one
  // hand's sweep rather than a wander; a hop back retraces on the other side.
  const bow = distance > curveFromPx ? Math.min(curveMaxPx, distance * curveRatio) : 0;
  const control = {
    x: from.x + dx / 2 - along.y * bow,
    y: from.y + dy / 2 + along.x * bow,
  };
  const overshoot = Math.min(overshootMaxPx, distance * 0.012);

  const points: Point[] = [];
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const s = ease(t);
    const u = 1 - s;
    const x = u * u * from.x + 2 * u * s * control.x + s * s * to.x;
    const y = u * u * from.y + 2 * u * s * control.y + s * s * to.y;
    const bump = overshoot * settle(t, 0.78);
    points.push({ x: x + along.x * bump, y: y + along.y * bump });
  }
  return { points, duration };
}

export function createCursorMover(el: HTMLElement, options: CursorMotionOptions = {}) {
  const settings = { ...DEFAULTS, ...options };
  const { hotspot } = settings;
  let at: Point | null = null;
  let running: Animation | null = null;

  const place = ({ x, y }: Point) => `calc(${x}px - ${hotspot.x * 100}%) calc(${y}px - ${hotspot.y * 100}%)`;

  function jumpTo(to: Point) {
    running?.cancel();
    running = null;
    at = to;
    el.style.translate = place(to);
  }

  /** Move the tip onto `to`; resolves once it has arrived and settled, or when cancelled. */
  function moveTo(to: Point): Promise<void> {
    if (!at || reducedMotion() || typeof el.animate !== 'function') {
      jumpTo(to);
      return Promise.resolve();
    }
    const from = at;
    if (Math.hypot(to.x - from.x, to.y - from.y) < 1) {
      jumpTo(to);
      return Promise.resolve();
    }
    running?.cancel();
    const { points, duration } = hopPath(from, to, settings);
    const animation = el.animate(
      points.map((point) => ({ translate: place(point) })),
      { duration, easing: 'linear', fill: 'forwards' },
    );
    running = animation;
    at = to;
    return new Promise((resolve) => {
      const done = () => {
        if (running === animation) {
          el.style.translate = place(to);
          animation.cancel();
          running = null;
        }
        resolve();
      };
      animation.addEventListener('finish', done, { once: true });
      animation.addEventListener('cancel', () => resolve(), { once: true });
    });
  }

  /** Stop a hop where it is. */
  function cancel() {
    if (!running) return;
    try {
      running.commitStyles();
    } catch {
      // Not rendered, so there is nothing to hold in place.
    }
    running.cancel();
    running = null;
  }

  return {
    moveTo,
    jumpTo,
    cancel,
    get position() {
      return at;
    },
  };
}
