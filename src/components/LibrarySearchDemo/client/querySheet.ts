import { mangledHtml, relevanceHtml, sqlHtml, sqlResultHtml } from '../markup';
import { search, type Filters, type SearchState } from '../search';
import { initialState, searchStore } from './store';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function filtersText(filters: Filters) {
  const set = [
    filters.category ? `category = ${filters.category}` : null,
    filters.colour ? `colour = ${filters.colour}` : null,
  ].filter(Boolean);
  return set.length ? `filtered to ${set.join(', ')}` : '';
}

/** Lights the three copies of the match fragment up again, so a keystroke is seen landing
    in every one of them at once. */
function flash(host: HTMLElement) {
  if (reducedMotion.matches) return;
  const code = host.querySelector<HTMLElement>('.sql');
  if (!code) return;
  // The fragments were just redrawn, so each starts its keyframes afresh; the class on the
  // block is what says they should play at all, and the first paint leaves it off.
  code.classList.add('flash');
}

/**
 * The relevance and SQL sheets: each has a query field of its own that shares the stack's
 * query, and redraws its live part from the same functions the build printed it with.
 */
export function initQuerySheet(host: HTMLElement) {
  const kind = host.dataset.librarySearch;
  const store = searchStore(host, initialState(host));
  const input = host.querySelector<HTMLInputElement>('.sheet-query');
  const mangled = host.querySelector<HTMLElement>('.mangled');
  const filters = host.querySelector<HTMLElement>('.filters-note');
  const live = host.querySelector<HTMLElement>('[data-live-part]');
  const result = host.querySelector<HTMLElement>('.sql-result');
  if (!input || !live) return;

  let drawn = '';
  const render = (state: SearchState) => {
    const key = JSON.stringify(state);
    if (key === drawn) return;
    drawn = key;

    if (input.value !== state.query) input.value = state.query;
    if (mangled) mangled.innerHTML = mangledHtml(state.query);
    if (filters) filters.textContent = filtersText(state.filters);

    if (kind === 'sql') {
      live.innerHTML = sqlHtml(state);
      if (result) result.innerHTML = sqlResultHtml(search(state));
      flash(host);
    } else {
      live.innerHTML = relevanceHtml(state);
    }
  };

  input.addEventListener('input', () => store.set({ query: input.value }, host));
  store.subscribe((state) => render(state));

  // The query may have moved on while this page was face down.
  drawn = JSON.stringify(initialState(host));
  render(store.get());
  host.dataset.ready = 'true';
}
