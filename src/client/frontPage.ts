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
 * Combines the two halves of "a visitor can see this page": its stack is on screen, and the
 * page is the one drawn on top. `onChange` fires on every change, starting from inactive —
 * the first call is the one that says the page has come alive.
 */
export function watchPageActive(el: Element, onChange: (active: boolean) => void): () => void {
  const stack = el.closest<HTMLElement>('[data-paper-stack-root]') ?? el;

  let front = isFrontPage(el);
  let onScreen = false;
  let active = false;

  const update = () => {
    const next = front && onScreen;
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

  return () => {
    stopFrontWatch();
    observer.disconnect();
  };
}
