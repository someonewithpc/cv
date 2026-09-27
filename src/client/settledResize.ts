/**
 * A ResizeObserver for measurements that only the settled size needs.
 *
 * Dragging a window edge resizes the page on every frame, and a callback that reads a box
 * there forces the style and layout the other observers have just dirtied: 50 to 130 ms per
 * step for the marker editor's canvas rect or the event bus token. While the window is being
 * resized the callback waits, and runs once, for the final size, when resizeHold.ts says the
 * size has settled. A size change that no window resize caused runs the callback at once, as
 * a plain ResizeObserver would.
 */
import { isSizeSettling, onSizeSettled } from './resizeHold';

let listening = false;
const held = new Set<() => void>();

export type SettledResizeObserver = Pick<ResizeObserver, 'observe' | 'unobserve' | 'disconnect'>;

export function settledResizeObserver(callback: () => void): SettledResizeObserver {
  if (!listening) {
    listening = true;
    onSizeSettled(() => {
      const callbacks = [...held];
      held.clear();
      callbacks.forEach((run) => run());
    });
  }
  const observer = new ResizeObserver(() => {
    if (isSizeSettling()) held.add(callback);
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
