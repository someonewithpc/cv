import type { SearchState } from '../search';

type Listener = (state: SearchState, source: unknown) => void;

export type SearchStore = {
  get: () => SearchState;
  /** `source` comes back to every listener, so the field that typed can leave itself alone. */
  set: (next: Partial<SearchState>, source: unknown) => void;
  subscribe: (listener: Listener) => () => void;
};

/* One query per stack. Each of the stack's live sheets is its own island and boots only
   once its page comes to the front, so they cannot hand the query to each other directly:
   the first to boot opens the store, keyed on the stack's root, and the rest join it with
   whatever the visitor has typed so far. */
const stores = new WeakMap<Element, SearchStore>();

export function searchStore(host: Element, initial: SearchState): SearchStore {
  const key = host.closest('[data-paper-stack-root]') ?? host;
  const existing = stores.get(key);
  if (existing) return existing;

  let state = initial;
  const listeners = new Set<Listener>();
  const store: SearchStore = {
    get: () => state,
    set(next, source) {
      state = { ...state, ...next };
      listeners.forEach((listener) => listener(state, source));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  stores.set(key, store);
  return store;
}

/** What a sheet rendered with at build time, read back off its host. */
export function initialState(root: HTMLElement): SearchState {
  return {
    query: root.dataset.query ?? '',
    filters: JSON.parse(root.dataset.filters ?? '{}') as SearchState['filters'],
  };
}
