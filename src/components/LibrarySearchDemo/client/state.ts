import type { SearchState } from '../search';

/** What a sheet rendered with at build time, read back off its host. Every sheet starts
    from its own and keeps its own from then on: typing on one never moves another. */
export function initialState(root: HTMLElement): SearchState {
  return {
    query: root.dataset.query ?? '',
    filters: JSON.parse(root.dataset.filters ?? '{}') as SearchState['filters'],
  };
}
