import { mangledHtml, relevanceHtml, sqlHtml, sqlResultHtml } from '../markup';
import { search, type Filters, type SearchState } from '../search';
import { requests, type RequestLog } from './requests';
import { initialState } from './state';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function filtersText(filters: Filters) {
  const set = [
    filters.category ? `category = ${filters.category}` : null,
    filters.color ? `color = ${filters.color}` : null,
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
 * The relevance and SQL sheets: each has a query field and a query of its own, which no
 * other sheet reads or moves, and redraws its live part from the same functions the build
 * printed it with. The SQL sheet also sends its query through the request pipeline and
 * prints what became of each request.
 */
export function initQuerySheet(host: HTMLElement) {
  const kind = host.dataset.librarySearch;
  const initial = initialState(host);
  const input = host.querySelector<HTMLInputElement>('.sheet-query');
  const mangled = host.querySelector<HTMLElement>('.mangled');
  const filters = host.querySelector<HTMLElement>('.filters-note');
  const live = host.querySelector<HTMLElement>('[data-live-part]');
  const result = host.querySelector<HTMLElement>('.sql-result');
  if (!input || !live) return;

  let state = initial;
  const render = () => {
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

  const key = host.querySelector<HTMLElement>('.requests .key');
  const tally = (name: string) => host.querySelector<HTMLElement>(`[data-tally="${name}"]`);
  const tallies = { sent: tally('sent'), dropped: tally('dropped'), aborted: tally('aborted') };
  const showLog = (log: RequestLog) => {
    if (key) key.textContent = `?${log.key}`;
    for (const name of ['sent', 'dropped', 'aborted'] as const) {
      const el = tallies[name];
      if (el) el.textContent = String(log[name]);
    }
  };
  const pipeline = kind === 'sql' ? requests(host, initial, () => {}, showLog) : null;
  // The build already drew the opening query's answer.
  pipeline?.shown(initial);

  input.addEventListener('input', () => {
    const next: SearchState = { ...state, query: input.value };
    const changed = next.query !== state.query;
    state = next;
    if (changed) render();
    pipeline?.request(state);
  });

  // The field may hold a query typed before the sheet booted.
  if (input.value !== initial.query) input.dispatchEvent(new Event('input'));
  host.dataset.ready = 'true';
}
