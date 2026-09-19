// Pulses the drawn cursor and draws a flare whenever a walkthrough presses something. Every
// walkthrough drives its demo with real DOM events, so this listens for those and needs no
// wiring per demo: a synthetic `mousedown`/`pointerdown` marks the nearest `[data-demo-cursor]`
// pressed, and both ends of the press get a ring at the event point. Synthetic events have
// `isTrusted === false`, which is how a walkthrough's press is told from the visitor's own.
import './demo-cursor-press.css';

const MIN_HOLD_MS = 140;
const FLARE_MS = 400;
const STACK = 'article.technical-drawing-stack';

let layer: HTMLElement | null = null;
let pressed: HTMLElement | null = null;
let pressedAt = 0;
let release: number | null = null;

function flareLayer() {
  if (!layer || !layer.isConnected) {
    layer = document.createElement('div');
    layer.className = 'demo-cursor-flares';
    layer.setAttribute('aria-hidden', 'true');
    document.body.append(layer);
  }
  return layer;
}

function flare(x: number, y: number, kind: 'down' | 'up') {
  const ring = document.createElement('span');
  ring.className = `demo-cursor-flare demo-cursor-flare--${kind}`;
  ring.style.left = `${x}px`;
  ring.style.top = `${y}px`;
  flareLayer().append(ring);
  const remove = () => ring.remove();
  ring.addEventListener('animationend', remove, { once: true });
  window.setTimeout(remove, FLARE_MS);
}

function cursorFor(target: EventTarget | null): HTMLElement | null {
  const stack = target instanceof Element ? target.closest(STACK) : null;
  const cursors = [...(stack ?? document).querySelectorAll<HTMLElement>('[data-demo-cursor]')];
  return cursors.at(-1) ?? null;
}

function down(event: MouseEvent) {
  if (release != null) {
    window.clearTimeout(release);
    release = null;
  }
  pressed?.removeAttribute('data-pressed');
  pressed = cursorFor(event.target);
  pressed?.setAttribute('data-pressed', '');
  pressedAt = performance.now();
  flare(event.clientX, event.clientY, 'down');
}

function up(event: MouseEvent) {
  const finish = () => {
    release = null;
    pressed?.removeAttribute('data-pressed');
    pressed = null;
    flare(event.clientX, event.clientY, 'up');
  };
  // A walkthrough may send down and up in the same tick; hold the pulse long enough to see.
  const remaining = MIN_HOLD_MS - (performance.now() - pressedAt);
  if (remaining > 0) {
    release = window.setTimeout(finish, remaining);
  } else {
    finish();
  }
}

function onPress(event: Event) {
  if (event.isTrusted || !(event instanceof MouseEvent)) return;
  if (event.type === 'mousedown' || event.type === 'pointerdown') {
    down(event);
  } else {
    up(event);
  }
}

for (const type of ['mousedown', 'pointerdown', 'mouseup', 'pointerup']) {
  document.addEventListener(type, onPress, true);
}
