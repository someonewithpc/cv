/**
 * Arm heavy demo islands after DOMContentLoaded, then mount when visible.
 *
 * Waiting for DCL avoids competing with the large TechIconCloud / OSS HTML parse.
 * IntersectionObserver starts the island once it enters the viewport (no click
 * required). A short idle yield keeps the dynamic import off the parse long-task.
 */
type BootWhenVisibleOptions = IntersectionObserverInit;

function afterDomContentLoaded(run: () => void) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
}

function afterIdle(run: () => void) {
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => run(), { timeout: 1500 });
  } else {
    setTimeout(run, 0);
  }
}

export function bootWhenVisible(
  target: Element,
  boot: () => void,
  options: BootWhenVisibleOptions = {},
) {
  const { root = null, rootMargin = '0px', threshold = 0.2, ...observerInit } = options;

  afterDomContentLoaded(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // A busy load can queue two records for the target before this runs, the first laid out
        // off screen and the second on it. The last one is where the target is now.
        if (!entries.at(-1)?.isIntersecting) return;
        observer.disconnect();
        afterIdle(boot);
      },
      { root, rootMargin, threshold, ...observerInit },
    );
    observer.observe(target);
  });
}
