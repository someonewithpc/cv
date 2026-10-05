/**
 * Placing an object without a pointer: the ghost starts in the middle of the canvas and the
 * arrow keys walk it, a sixteenth of the canvas's shorter side a press, kept inside the canvas.
 * The point is a fraction of the canvas, so a scroll between presses does not move it, and
 * both scene apps feed it to setGhostAt the way a pointer move would.
 */
export type KeyPoint = { x: number; y: number };

const STEPS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

export const KEY_PLACE_HINT = 'Arrow keys move it · Enter places it · Esc cancels';

export const ghostStart = (): KeyPoint => ({ x: 0.5, y: 0.5 });

/** The point one arrow press on, or null when `key` is not an arrow. */
export function ghostStep(point: KeyPoint, key: string, rect: DOMRect): KeyPoint | null {
  const step = STEPS[key];
  if (!step || !rect.width || !rect.height) return null;
  const size = Math.min(rect.width, rect.height) / 16;
  const clamp = (value: number) => Math.min(0.98, Math.max(0.02, value));
  return {
    x: clamp(point.x + (step[0] * size) / rect.width),
    y: clamp(point.y + (step[1] * size) / rect.height),
  };
}

export const ghostClient = (point: KeyPoint, rect: DOMRect) => ({
  x: rect.left + point.x * rect.width,
  y: rect.top + point.y * rect.height,
});

/** Enter or Space puts it down. */
export const isPlaceKey = (key: string) => key === 'Enter' || key === ' ';
