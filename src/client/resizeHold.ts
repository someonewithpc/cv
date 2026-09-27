/**
 * Tells the page when the window is being resized, and when the new size has settled.
 *
 * One resize listener and one frame loop serve two clients, each with its own settle rule:
 *
 * - Measurements that only the final size needs (settledResize.ts) wait until MEASURE_MS
 *   have passed since the end of the frame that laid out the last size, and MEASURE_FRAMES
 *   more frames have begun. The time counts from that frame's end, not from the event, so
 *   a slow frame does not end the wait early.
 * - The demo hold marks the root `data-resizing` from the first resize event until the size
 *   has held for HOLD_MS and for HOLD_FRAMES frames that began after the last resize. On a
 *   slow machine, where one frame of a drag can take longer than HOLD_MS, the frames decide,
 *   so the hold does not lapse between two frames of the same drag.
 *
 * The hold goes through the demo gates (src/client/frontPage.ts) as `holdAll('resize')`, so
 * every clock on a gate stops counting and runs out the time it had left once the size
 * settles. A walkthrough resumes at the step it was on. A stack pauses its front page's
 * animations (the dog-ear pulse, the deck's LED and the like) through `onResizeHold`, which
 * the gates cannot do. Nothing here touches a demo's autoplay state, so a demo the reader
 * paused from the deck stays paused.
 */
import { holdAll, releaseAll } from './frontPage';

const MEASURE_MS = 200;
const MEASURE_FRAMES = 2;
const HOLD_MS = 300;
const HOLD_FRAMES = 4;
const ATTRIBUTE = 'data-resizing';

type Listener = (holding: boolean) => void;

let holding = false;
let settling = false;
let looping = false;
let lastResize = 0;
let quietFrames = 0;
let laidOut = 0;
let measureFrames = 0;
let listening = false;
const listeners = new Set<Listener>();
const settledListeners = new Set<() => void>();

// The resize event comes before the frame's animation callbacks, so the frame it arrives in
// lays out the new size, and the first frame to begin after it starts where that one ended.
function tick(frameStart: number) {
  if (frameStart > lastResize) {
    quietFrames += 1;
    if (quietFrames === 1) laidOut = frameStart;
    if (frameStart - laidOut >= MEASURE_MS) measureFrames += 1;
  }
  if (settling && measureFrames >= MEASURE_FRAMES) {
    settling = false;
    settledListeners.forEach((listener) => listener());
  }
  if (holding && quietFrames >= HOLD_FRAMES && performance.now() - lastResize >= HOLD_MS) {
    holding = false;
    document.documentElement.removeAttribute(ATTRIBUTE);
    releaseAll('resize');
    listeners.forEach((listener) => listener(false));
  }
  looping = holding || settling;
  if (looping) requestAnimationFrame(tick);
}

function onResize() {
  lastResize = performance.now();
  quietFrames = 0;
  measureFrames = 0;
  settling = true;
  if (!holding) {
    holding = true;
    document.documentElement.setAttribute(ATTRIBUTE, '');
    holdAll('resize');
    listeners.forEach((listener) => listener(true));
  }
  if (!looping) {
    looping = true;
    requestAnimationFrame(tick);
  }
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

/** True from a resize event until measurements of the new size can be taken. */
export function isSizeSettling() {
  return settling;
}

/** Calls `listener` each time a resize has settled for measurements. */
export function onSizeSettled(listener: () => void) {
  watchResizeHold();
  settledListeners.add(listener);
  return () => {
    settledListeners.delete(listener);
  };
}
