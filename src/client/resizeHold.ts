/**
 * Holds the demos still while the window is being resized.
 *
 * One resize listener marks the root `data-resizing` from the first resize event until the
 * size has held for SETTLE_MS and for SETTLE_FRAMES frames that began after the last resize.
 * On a fast machine the time decides. On a slow one, where one frame of a drag can take
 * longer than SETTLE_MS, the frames do, so the hold does not lapse between two frames of the
 * same drag.
 *
 * The hold goes through the demo gates (src/client/frontPage.ts) as `holdAll('resize')`, so
 * every clock on a gate stops counting and runs out the time it had left once the size
 * settles. A walkthrough resumes at the step it was on. A stack pauses its front page's
 * animations (the dog-ear pulse, the deck's LED and the like) through `onResizeHold`, which
 * the gates cannot do. Nothing here touches a demo's autoplay state, so a demo the reader
 * paused from the deck stays paused.
 */
import { holdAll, releaseAll } from './frontPage';

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
  releaseAll('resize');
  listeners.forEach((listener) => listener(false));
}

function onResize() {
  lastResize = performance.now();
  quietFrames = 0;
  if (holding) return;
  holding = true;
  document.documentElement.setAttribute(ATTRIBUTE, '');
  holdAll('resize');
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
