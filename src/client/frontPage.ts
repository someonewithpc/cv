/**
 * Which page of a PaperStack is the one being looked at.
 *
 * Once PaperStack's script runs, every page of a stack sits in the same CSS grid cell and
 * only the fold's clip-path decides which is drawn on top, so an IntersectionObserver —
 * even one rooted at the stack — reports all of them as equally visible. `--page-index` is
 * what fold-drag.ts itself renumbers on a committed flip (front = "1"), so it is the only
 * signal that tracks the front page. MarkerEditorDemo's EditorLayerApp.tsx reads it the
 * same way.
 */

function pageWrapper(el: Element): HTMLElement | null {
  return el.closest<HTMLElement>('[data-paper-stack-root] > *');
}

function readFront(wrapper: HTMLElement): boolean {
  return wrapper.style.getPropertyValue('--page-index').trim() === '1';
}

/** True for an element outside any stack, so callers can share one code path. */
export function isFrontPage(el: Element): boolean {
  const wrapper = pageWrapper(el);
  return wrapper === null || readFront(wrapper);
}

/** Calls `onChange` on every change of front-page state, never for the initial one. */
export function watchFrontPage(el: Element, onChange: (front: boolean) => void): () => void {
  const wrapper = pageWrapper(el);
  if (!wrapper) return () => {};

  let front = readFront(wrapper);
  const observer = new MutationObserver(() => {
    const next = readFront(wrapper);
    if (next === front) return;
    front = next;
    onChange(front);
  });
  observer.observe(wrapper, { attributes: true, attributeFilter: ['style'] });
  return () => observer.disconnect();
}

/**
 * The stacks whose turn is already decided. fold-drag.ts marks one the moment its turn is
 * certain to finish — a drag carried past the commit point, or a key, wheel or swipe turn as
 * it starts — and unmarks it as the stack settles. A module-level set rather than an attribute
 * on the stack, because the page's `:has()` rules make any attribute write a whole-document
 * style resolve, which is the cost a turn already pays too much of.
 */
const turningStacks = new WeakSet<Element>();
const turnWatchers = new WeakMap<Element, Set<() => void>>();

/** PaperStack's own call: true at the commit point, false as the stack comes to rest. */
export function setStackTurning(stack: Element, turning: boolean): void {
  if (turningStacks.has(stack) === turning) return;
  if (turning) turningStacks.add(stack);
  else turningStacks.delete(stack);
  for (const notify of [...(turnWatchers.get(stack) ?? [])]) notify();
}

function watchStackTurning(stack: Element, onChange: () => void): () => void {
  const watchers = turnWatchers.get(stack) ?? new Set<() => void>();
  turnWatchers.set(stack, watchers);
  watchers.add(onChange);
  return () => {
    watchers.delete(onChange);
  };
}

/**
 * Why a demo is standing still. It runs only while none applies. The first four are read from
 * the page itself; the rest are held from outside, through a gate's `hold` or `holdAll`.
 */
export type PauseReason = 'offscreen' | 'back-page' | 'turning' | 'hidden' | 'resize' | 'user' | 'review';

export interface DemoGate {
  readonly running: boolean;
  readonly reasons: ReadonlySet<PauseReason>;
  hold(reason: PauseReason): void;
  release(reason: PauseReason): void;
  /** Fires on every change of `running`, never for the initial state. */
  onChange(listener: (running: boolean, reasons: ReadonlySet<PauseReason>) => void): () => void;
  /** Resolves at once while running, else the next time the gate opens. */
  whenRunning(): Promise<void>;
  /** Like setTimeout, but its clock stops while the gate is held. */
  wait(ms: number): Promise<void>;
  /** Milliseconds the gate has been open, for tweens that pick up where they were held. */
  now(): number;
  /** The next animation frame once the gate is open. */
  frame(): Promise<void>;
  dispose(): void;
}

const gates = new Set<{ set(reason: PauseReason, on: boolean): void }>();

/**
 * Review switch, for measuring only: `?autoplay=off` holds every demo from boot, so a trace can
 * compare the page with the walkthroughs playing and without them. Read once, at load.
 */
const autoplaySwitchedOff = typeof location !== 'undefined'
  && new URLSearchParams(location.search).get('autoplay') === 'off';

const heldEverywhere = new Set<PauseReason>(autoplaySwitchedOff ? ['review'] : []);
const tabHidden = () => document.visibilityState === 'hidden';

let watchingTab = false;
function watchTab() {
  if (watchingTab) return;
  watchingTab = true;
  document.addEventListener('visibilitychange', () => {
    for (const gate of gates) gate.set('hidden', tabHidden());
  });
}

/** Holds every demo on the page for `reason`, including ones created while it is held. */
export function holdAll(reason: PauseReason): void {
  heldEverywhere.add(reason);
  for (const gate of gates) gate.set(reason, true);
}

export function releaseAll(reason: PauseReason): void {
  heldEverywhere.delete(reason);
  for (const gate of gates) gate.set(reason, false);
}

/**
 * Whether a visitor can see this page and it is holding still: its stack is on screen, the
 * page is the one drawn on top, no committed turn is under way on that stack, and the tab is
 * showing. Starts held for `offscreen` until the first intersection report says otherwise.
 *
 * The turn is in it because a demo playing under a page that is folding away costs the turn
 * its frames, and re-resolves the style of everything printed on that page as it goes. It only
 * counts from the commit point: a drag that comes back short of it never pauses anything, so
 * whatever is expensive to stop and start again — the Space Builder's WebGL context above all
 * — is never churned by a reader merely fiddling with the dog-ear. The page arriving at the
 * front waits for the settle in the same way, rather than coming alive under a sheet still
 * gliding over it.
 */
export function demoGate(el: Element): DemoGate {
  const stack = el.closest<HTMLElement>('[data-paper-stack-root]') ?? el;
  const reasons = new Set<PauseReason>(['offscreen', ...heldEverywhere]);
  if (!isFrontPage(el)) reasons.add('back-page');
  if (turningStacks.has(stack)) reasons.add('turning');
  if (tabHidden()) reasons.add('hidden');

  const listeners = new Set<(running: boolean, reasons: ReadonlySet<PauseReason>) => void>();
  let waiters: Array<() => void> = [];
  let running = false;
  let openFor = 0;
  let openedAt = 0;

  const set = (reason: PauseReason, on: boolean) => {
    if (reasons.has(reason) === on) return;
    if (on) reasons.add(reason);
    else reasons.delete(reason);
    const next = reasons.size === 0;
    if (next === running) return;
    running = next;
    if (running) openedAt = performance.now();
    else openFor += performance.now() - openedAt;
    if (running) {
      const woken = waiters;
      waiters = [];
      woken.forEach((wake) => wake());
    }
    for (const listener of [...listeners]) listener(running, reasons);
  };

  const stopFrontWatch = watchFrontPage(el, (front) => set('back-page', !front));

  // Viewport root, not the stack: with root:stack a page reads as intersecting even while
  // the whole stack is still below the fold (see TechnicalDrawing/Stack.astro).
  const observer = new IntersectionObserver(
    (entries) => set('offscreen', !entries[entries.length - 1]?.isIntersecting),
    { threshold: 0.2 },
  );
  observer.observe(stack);

  const stopTurnWatch = watchStackTurning(stack, () => set('turning', turningStacks.has(stack)));

  const whenRunning = () => (running ? Promise.resolve() : new Promise<void>((wake) => waiters.push(wake)));

  const entry = { set };
  gates.add(entry);
  watchTab();

  const gate: DemoGate = {
    get running() {
      return running;
    },
    reasons,
    hold: (reason) => set(reason, true),
    release: (reason) => set(reason, false),
    onChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    whenRunning,
    now: () => openFor + (running ? performance.now() - openedAt : 0),
    frame: () => whenRunning().then(() => new Promise<void>((next) => requestAnimationFrame(() => next()))),
    wait(ms) {
      return new Promise<void>((resolve) => {
        let left = ms;
        let since = 0;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const start = () => {
          since = performance.now();
          timer = setTimeout(finish, left);
        };
        const stop = () => {
          clearTimeout(timer);
          left -= performance.now() - since;
        };
        const off = gate.onChange((open) => (open ? start() : stop()));
        function finish() {
          off();
          resolve();
        }
        if (running) start();
      });
    },
    dispose() {
      stopFrontWatch();
      stopTurnWatch();
      observer.disconnect();
      listeners.clear();
      gates.delete(entry);
    },
  };
  return gate;
}

/** `onChange` fires on every change of the page's gate, starting from inactive. */
export function watchPageActive(
  el: Element,
  onChange: (active: boolean, reasons: ReadonlySet<PauseReason>) => void,
): () => void {
  const gate = demoGate(el);
  gate.onChange(onChange);
  return () => gate.dispose();
}
