/**
 * Holds the demos still while the window is being resized.
 *
 * One resize listener marks the root `data-resizing` from the first resize event until the
 * size has held for SETTLE_MS and for SETTLE_FRAMES frames that began after the last resize.
 * On a fast machine the time decides. On a slow one, where one frame of a drag can take
 * longer than SETTLE_MS, the frames do, so the hold does not lapse between two frames of the
 * same drag.
 *
 * A stack pauses its front page's animations (the dog-ear pulse, the deck's LED and the
 * like) for the hold, and autoplay timers made with `holdableTimeout` stop counting down,
 * then run out the time they had left. A walkthrough resumes at the step it was on. Nothing here touches a
 * demo's autoplay state, so a demo the reader paused from the deck stays paused.
 */
const SETTLE_MS = 300;
const SETTLE_FRAMES = 4;
const ATTRIBUTE = 'data-resizing';

type Listener = (holding: boolean) => void;

let holding = false;
let lastResize = 0;
let quietFrames = 0;
let listening = false;
const listeners = new Set<Listener>();

function settle(frameStart: number) {
  if (frameStart > lastResize) quietFrames += 1;
  if (quietFrames < SETTLE_FRAMES || performance.now() - lastResize < SETTLE_MS) {
    requestAnimationFrame(settle);
    return;
  }
  holding = false;
  document.documentElement.removeAttribute(ATTRIBUTE);
  listeners.forEach((listener) => listener(false));
}

function onResize() {
  lastResize = performance.now();
  quietFrames = 0;
  if (holding) return;
  holding = true;
  document.documentElement.setAttribute(ATTRIBUTE, '');
  listeners.forEach((listener) => listener(true));
  requestAnimationFrame(settle);
}

export function watchResizeHold() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('resize', onResize, { passive: true });
}

export function isResizeHeld() {
  return holding;
}

export function onResizeHold(listener: Listener) {
  watchResizeHold();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * setTimeout that stops counting while a resize holds the page and runs out the rest once
 * it settles. Returns a cancel function.
 */
export function holdableTimeout(run: () => void, ms: number) {
  let left = ms;
  let started = 0;
  let timer = 0;
  let done = false;

  const arm = () => {
    started = performance.now();
    timer = window.setTimeout(() => {
      done = true;
      stop();
      run();
    }, Math.max(0, left));
  };

  const stop = onResizeHold((held) => {
    if (done) return;
    if (held) {
      window.clearTimeout(timer);
      left -= performance.now() - started;
    } else {
      arm();
    }
  });

  if (!holding) arm();

  return () => {
    done = true;
    window.clearTimeout(timer);
    stop();
  };
}

/** A pause of `ms` that a resize stretches by however long it holds the page. */
export function holdableWait(ms: number) {
  return new Promise<void>((resolve) => {
    holdableTimeout(resolve, ms);
  });
}
