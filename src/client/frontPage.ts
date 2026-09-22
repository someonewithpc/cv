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
 * Combines the three parts of "a visitor can see this page and it is holding still": its stack
 * is on screen, the page is the one drawn on top, and no committed turn is under way on that
 * stack. `onChange` fires on every change, starting from inactive — the first call is the one
 * that says the page has come alive.
 *
 * The turn is in it because a demo playing under a page that is folding away costs the turn
 * its frames, and re-resolves the style of everything printed on that page as it goes. It only
 * counts from the commit point: a drag that comes back short of it never pauses anything, so
 * whatever is expensive to stop and start again — the Space Builder's WebGL context above all
 * — is never churned by a reader merely fiddling with the dog-ear. The page arriving at the
 * front waits for the settle in the same way, rather than coming alive under a sheet still
 * gliding over it.
 */
export function watchPageActive(el: Element, onChange: (active: boolean) => void): () => void {
  const stack = el.closest<HTMLElement>('[data-paper-stack-root]') ?? el;

  let front = isFrontPage(el);
  let onScreen = false;
  let active = false;

  const update = () => {
    const next = front && onScreen && !turningStacks.has(stack);
    if (next === active) return;
    active = next;
    onChange(active);
  };

  const stopFrontWatch = watchFrontPage(el, (next) => {
    front = next;
    update();
  });

  // Viewport root, not the stack: with root:stack a page reads as intersecting even while
  // the whole stack is still below the fold (see TechnicalDrawing/Stack.astro).
  const observer = new IntersectionObserver(
    (entries) => {
      onScreen = Boolean(entries[0]?.isIntersecting);
      update();
    },
    { threshold: 0.2 },
  );
  observer.observe(stack);

  const stopTurnWatch = watchStackTurning(stack, update);

  return () => {
    stopFrontWatch();
    stopTurnWatch();
    observer.disconnect();
  };
}
