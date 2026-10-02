export type DebouncedFunc<F extends (...args: any[]) => void> = F & { flush: () => void };

/**
 * Trailing-edge debounce with `flush`. The controls here all want the same thing: wait
 * `wait` ms after the last call, then run once with the latest arguments, and let a blur
 * or change event force that run early. No leading edge, no `maxWait`, no `cancel` — none
 * of the callers need them.
 */
export function debounce<F extends (...args: any[]) => void>(fn: F, wait: number): DebouncedFunc<F> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let pendingArgs: Parameters<F> | undefined;

  const invoke = () => {
    timeoutId = undefined;
    if (!pendingArgs) return;
    const args = pendingArgs;
    pendingArgs = undefined;
    fn(...args);
  };

  const debounced = ((...args: Parameters<F>) => {
    pendingArgs = args;
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    timeoutId = setTimeout(invoke, wait);
  }) as DebouncedFunc<F>;

  debounced.flush = () => {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    invoke();
  };

  return debounced;
}
