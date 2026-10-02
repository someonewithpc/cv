import { search, serialise, type SearchResult, type SearchState } from '../search';

/** The leading-edge throttle in front of the request. */
const THROTTLE_MS = 50;
/** How long the mock server takes to answer, low and high. */
const LATENCY_MS = [90, 260] as const;

/** What a sheet's request pipeline has done so far, for the Generated SQL sheet to print. */
export type RequestLog = { key: string; sent: number; dropped: number; aborted: number };

export function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason);
    }, { once: true });
  });
}

/** Stands in for the controller: nothing leaves the page, but an answer takes as long to
    come back as one would, and an aborted request never answers. */
async function mockServer(state: SearchState, signal: AbortSignal) {
  await wait(LATENCY_MS[0] + Math.random() * (LATENCY_MS[1] - LATENCY_MS[0]), signal);
  return search(state);
}

/**
 * The front end's request handling, the product's library_object_search.js in outline. It
 * searches on every keystroke: requests in flight are held in a map keyed by the serialised
 * form, a query identical to one in flight (or to the one on screen) is dropped outright, a
 * superseded one is aborted, and the survivor goes out behind a 50 ms leading-edge throttle.
 * Each sheet with a query field runs its own, marking `root` as it goes; what it does is
 * reported to `onLog`, which the Generated SQL sheet prints.
 */
export function requests(
  root: HTMLElement,
  initial: SearchState,
  onResult: (result: SearchResult) => void,
  onLog: (log: RequestLog) => void = () => {},
) {
  const inFlight = new Map<string, AbortController>();
  const log: RequestLog = { key: serialise(initial), sent: 0, dropped: 0, aborted: 0 };
  let onScreen = '';
  let lastSent = -Infinity;
  let pending: SearchState | null = null;
  let timer = 0;

  const report = () => onLog({ ...log });
  const tallied = (name: 'sent' | 'dropped' | 'aborted') => {
    log[name] += 1;
    report();
  };

  const send = async (state: SearchState) => {
    const key = serialise(state);
    const controller = new AbortController();
    inFlight.set(key, controller);
    lastSent = performance.now();
    tallied('sent');
    root.dataset.loading = 'true';
    try {
      const result = await mockServer(state, controller.signal);
      onScreen = key;
      onResult(result);
      root.dataset.answered = key;
    } catch (err) {
      // Aborted: a newer query has taken its place. Anything else is a real failure in
      // onResult or render, and swallowing it here would hide the bug.
      if (!(err instanceof DOMException && err.name === 'AbortError')) throw err;
    } finally {
      if (inFlight.get(key) === controller) inFlight.delete(key);
      if (!inFlight.size) delete root.dataset.loading;
    }
  };

  const flush = () => {
    timer = 0;
    const state = pending;
    pending = null;
    if (state) void send(state);
  };

  const request = (state: SearchState) => {
    const key = serialise(state);
    log.key = key;
    if (inFlight.has(key) || (!inFlight.size && !pending && key === onScreen)) {
      tallied('dropped');
      return;
    }
    inFlight.forEach((controller) => {
      controller.abort();
      log.aborted += 1;
    });
    inFlight.clear();
    report();

    pending = state;
    const early = lastSent + THROTTLE_MS - performance.now();
    if (early <= 0 && !timer) flush();
    else if (!timer) timer = window.setTimeout(flush, Math.max(0, early));
  };

  const shown = (state: SearchState) => {
    onScreen = serialise(state);
    root.dataset.answered = onScreen;
  };

  report();
  return { request, shown };
}
