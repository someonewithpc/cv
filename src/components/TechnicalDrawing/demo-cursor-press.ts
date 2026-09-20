// Pulses the drawn cursor and draws a flare whenever a walkthrough presses something. Every
// walkthrough drives its demo with real DOM events, so this listens for those and needs no
// wiring per demo: a synthetic `mousedown`/`pointerdown` marks the nearest `[data-demo-cursor]`
// pressed, and both ends of the press get a ring at the event point. Synthetic events have
// `isTrusted === false`, which is how a walkthrough's press is told from the visitor's own.
//
// Walkthroughs should press through `demoPress()`, which sends the down, lets the pulse show,
// and only then sends the up and the click, so the cursor moves before the widget reacts. A
// drag is the same press pulled apart: `demoPressDown()`, the walkthrough's own moves, then
// `demoRelease()`.
import './demo-cursor-press.css';

/** How long the cursor stays pressed before the widget hears the release and the click. */
export const PRESS_HOLD_MS = 140;
// The release visuals trail the up event by this much, so the widget's reaction to the click
// (dispatched right after the up) is on screen before the cursor springs back.
const RELEASE_MS = 50;
const FLARE_MS = 400;
const STACK = 'article.technical-drawing-stack';
const INSTALLED = '__demoCursorPress';

export interface DemoPressOptions {
  /** Milliseconds between the down and the up; skipped under prefers-reduced-motion. */
  hold?: number;
  /** Send a `click` after the up (default true). */
  click?: boolean;
  /** Send a `dblclick` after the up (and after the click, when both). */
  dblclick?: boolean;
}

let layer: HTMLElement | null = null;
let pressed: HTMLElement | null = null;
let pressedAt = 0;
let release: number | null = null;

function reducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function mouse(type: string, point: { x: number; y: number }, buttons: number) {
  return new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX: point.x,
    clientY: point.y,
    buttons,
  });
}

/**
 * The first half of a press: mousedown on `target` at `point` (viewport coordinates, the
 * drawn cursor's hot spot), then a hold long enough for the pulse and flare to show. A drag
 * sends its moves once this resolves and ends with `demoRelease()`.
 */
export async function demoPressDown(
  target: Element,
  point: { x: number; y: number },
  hold = PRESS_HOLD_MS,
): Promise<void> {
  target.dispatchEvent(mouse('mousedown', point, 1));
  const wait = reducedMotion() ? 0 : hold;
  if (wait > 0) await new Promise((resolve) => window.setTimeout(resolve, wait));
}

/** The mouseup that ends a press or a drag, at the point where the cursor let go. */
export function demoRelease(target: Element, point: { x: number; y: number }): void {
  target.dispatchEvent(mouse('mouseup', point, 0));
}

/**
 * Press `target` at `point` the way a walkthrough should: mousedown, the hold, then mouseup
 * and the click. Resolves once the click has been dispatched.
 */
export async function demoPress(
  target: Element,
  point: { x: number; y: number },
  { hold = PRESS_HOLD_MS, click = true, dblclick = false }: DemoPressOptions = {},
): Promise<void> {
  await demoPressDown(target, point, hold);
  demoRelease(target, point);
  if (click) {
    if (target instanceof HTMLElement) target.click();
    else target.dispatchEvent(mouse('click', point, 0));
  }
  if (dblclick) target.dispatchEvent(mouse('dblclick', point, 0));
}

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
  // A raw walkthrough may send down and up in the same tick; hold the pulse long enough to
  // see. Either way the release trails the up, so it lands after the click's effect.
  const remaining = PRESS_HOLD_MS - (performance.now() - pressedAt);
  release = window.setTimeout(finish, Math.max(remaining, RELEASE_MS));
}

function onPress(event: Event) {
  if (event.isTrusted || !(event instanceof MouseEvent)) return;
  if (event.type === 'mousedown' || event.type === 'pointerdown') {
    down(event);
  } else {
    up(event);
  }
}

// Island bundles import this module for `demoPress()` too; listen once per document.
const scope = window as Window & { [INSTALLED]?: boolean };
if (!scope[INSTALLED]) {
  scope[INSTALLED] = true;
  for (const type of ['mousedown', 'pointerdown', 'mouseup', 'pointerup']) {
    document.addEventListener(type, onPress, true);
  }
}
