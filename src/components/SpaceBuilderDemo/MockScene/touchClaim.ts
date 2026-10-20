import { onBeforeUnmount, ref } from 'vue';

/** How far a finger may wander and still count as a tap, in CSS px. */
const TAP_SLOP = 10;

/**
 * Who a finger on a 3D scene belongs to. Taken over, a scene has every gesture, as the
 * product's does: one finger orbits, drags a handle or draws an area. At phone width it is
 * most of the screen, though, and a reader swiping up the page over it got no scroll at all.
 * So until a tap claims it the scene is `touch-action: pan-y` like the stack around it, and
 * leaves the finger to the page: up and down scroll, sideways turns the page. The app sets
 * that from `claimed`, gives each pointerdown to `passes` first, calls `claim` when the
 * visitor takes the demo over some other way, and `release` when the scene leaves the front
 * of the page or the screen, or the walkthrough takes it back. A mouse is never held off.
 */
export function useTouchClaim(onClaim: () => void) {
  const claimed = ref(false);
  let down: { id: number, x: number, y: number } | null = null;

  const lift = (event: PointerEvent) => {
    if (!down || event.pointerId !== down.id) return;
    const tap = event.type === 'pointerup'
      && Math.hypot(event.clientX - down.x, event.clientY - down.y) <= TAP_SLOP;
    down = null;
    if (!tap) return;
    claimed.value = true;
    onClaim();
  };
  // A scroll ends the finger with pointercancel; a swipe that turned the page ends far away
  window.addEventListener('pointerup', lift);
  window.addEventListener('pointercancel', lift);
  onBeforeUnmount(() => {
    window.removeEventListener('pointerup', lift);
    window.removeEventListener('pointercancel', lift);
  });

  /** Whether the scene should leave this pointer alone. A pointerdown is watched for a tap. */
  const passes = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' || claimed.value) return false;
    if (event.type === 'pointerdown') down = { id: event.pointerId, x: event.clientX, y: event.clientY };
    return true;
  };

  const claim = () => {
    claimed.value = true;
  };

  const release = () => {
    claimed.value = false;
  };

  return { claimed, passes, claim, release };
}
