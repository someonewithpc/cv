import type { SpaceBuilderScene } from './SpaceBuilderScene';

export type ScreenPoint = { x: number; y: number };

export type PinchState = {
  startDistance: number;
  startRadius: number;
  lastMidX: number;
  lastMidY: number;
};

export function isTouchPointer(event: PointerEvent) {
  return event.pointerType === 'touch';
}

/** Fat-finger hit slop for SelectArea handles (CSS px). */
export function handleScreenSlop(event: PointerEvent) {
  return isTouchPointer(event) ? 48 : 0;
}

export function pinchDistance(a: ScreenPoint, b: ScreenPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function beginPinch(
  scene: SpaceBuilderScene,
  a: ScreenPoint,
  b: ScreenPoint,
): PinchState {
  scene.endOrbit();
  scene.endPan();
  scene.endHandleDrag();
  if (scene.isDrawing()) scene.endAreaDraw();

  const dist = Math.max(1, pinchDistance(a, b));
  return {
    startDistance: dist,
    startRadius: scene.getOrbitRadius(),
    lastMidX: (a.x + b.x) / 2,
    lastMidY: (a.y + b.y) / 2,
  };
}

/** Pinch to dolly; midpoint drag pans the orbit target. */
export function updatePinch(
  scene: SpaceBuilderScene,
  state: PinchState,
  a: ScreenPoint,
  b: ScreenPoint,
) {
  const dist = Math.max(1, pinchDistance(a, b));
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;
  scene.setOrbitRadius(state.startRadius * (state.startDistance / dist));
  scene.panByScreenDelta(midX - state.lastMidX, midY - state.lastMidY);
  state.lastMidX = midX;
  state.lastMidY = midY;
}

export function applyWheelZoom(scene: SpaceBuilderScene, event: WheelEvent) {
  // Horizontal trackpad/shift-wheel scroll should reach the page (carousel paging)
  // instead of being swallowed here — only capture predominantly vertical scroll.
  if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
  // A trackpad pinch arrives as a wheel with ctrlKey set, and it zooms the page. At phone width a
  // scene fills the zoomed view, so taking it here left no spot to pinch the page back out from.
  if (event.ctrlKey) return;
  event.preventDefault();
  // deltaY > 0 → zoom out (larger radius).
  const factor = Math.exp(event.deltaY * 0.0012);
  scene.dolly(factor);
}

export function trySetPointerCapture(target: EventTarget | null, pointerId: number) {
  if (!(target instanceof Element) || !target.setPointerCapture) return;
  try {
    target.setPointerCapture(pointerId);
  } catch {
    // Ignore NotFoundError when the pointer already ended.
  }
}

/**
 * Hover feedback for SelectArea handles: 'grab' where dragging is wired up,
 * 'not-allowed' where the handles are shown but only for reference (Parameters,
 * Layout Styles). Call on idle pointermove only — not mid-gesture.
 */
export function updateHandleHoverCursor(
  scene: SpaceBuilderScene,
  element: HTMLElement,
  clientX: number,
  clientY: number,
  mode: 'grab' | 'forbid',
) {
  const handle = scene.pickHandle(clientX, clientY);
  element.style.cursor = handle ? (mode === 'forbid' ? 'not-allowed' : 'grab') : '';
}
