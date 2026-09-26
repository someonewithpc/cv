/**
 * A ResizeObserver for measurements that only the settled size needs.
 *
 * Dragging a window edge resizes the page on every frame, and a callback that reads a box
 * there forces the style and layout the other observers have just dirtied: 50 to 130 ms per
 * step for the marker editor's canvas rect or the event bus token. While the window is being
 * resized the callback waits, and runs once, for the final size, when no resize has come for
 * SETTLE_MS and two more frames. A size change that no window resize caused runs the callback
 * at once, as a plain ResizeObserver would.
 */

const SETTLE_MS = 200;

let resizing = false;
let resizes = 0;
let lastFrameEnd = 0;
let settling = false;
let listening = false;
const held = new Set<() => void>();

function settle() {
  const quiet = performance.now() - lastFrameEnd;
  if (quiet < SETTLE_MS) {
    setTimeout(settle, SETTLE_MS - quiet);
    return;
  }
  // A resize waiting for the next rendering update has not fired its event yet.
  const seen = resizes;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (resizes !== seen) {
      setTimeout(settle, SETTLE_MS);
      return;
    }
    settling = false;
    resizing = false;
    const callbacks = [...held];
    held.clear();
    callbacks.forEach((callback) => callback());
  }));
}

function onResize() {
  resizing = true;
  resizes += 1;
  // The quiet time counts from the end of the frame that lays this size out, not from the
  // event: on a slow page that frame alone can outlast SETTLE_MS.
  requestAnimationFrame(() => setTimeout(() => {
    lastFrameEnd = performance.now();
    if (settling) return;
    settling = true;
    setTimeout(settle, SETTLE_MS);
  }));
}

export type SettledResizeObserver = Pick<ResizeObserver, 'observe' | 'unobserve' | 'disconnect'>;

export function settledResizeObserver(callback: () => void): SettledResizeObserver {
  if (!listening) {
    listening = true;
    window.addEventListener('resize', onResize, { passive: true });
  }
  const observer = new ResizeObserver(() => {
    if (resizing) held.add(callback);
    else callback();
  });
  return {
    observe: (target, options) => observer.observe(target, options),
    unobserve: (target) => observer.unobserve(target),
    disconnect: () => {
      held.delete(callback);
      observer.disconnect();
    },
  };
}
