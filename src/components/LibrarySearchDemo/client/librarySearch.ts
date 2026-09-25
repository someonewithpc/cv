import { onAutoplayCommand, reportAutoplayState } from '@/client/autoplayStatus';
import { watchPageActive } from '@/client/frontPage';

import { mangledHtml } from '../markup';
import { libraryObjects } from '../objects';
import { formatScore, search, serialise, type Filters, type SearchResult, type SearchState } from '../search';
import { initialState, searchStore } from './store';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

/** The leading-edge throttle in front of the request. */
const THROTTLE_MS = 50;
/** How long the mock server takes to answer, low and high. */
const LATENCY_MS = [90, 260] as const;
/** Matches the bar's scale transition in SearchTool.astro. */
const MOVE_MS = 350;

type Step = { type?: string; clear?: boolean; color?: string; hold: number };

type Tool = {
  root: HTMLElement;
  input: HTMLInputElement;
  selects: HTMLSelectElement[];
  list: HTMLOListElement;
  rows: Map<string, HTMLElement>;
  empty: HTMLElement | null;
  count: HTMLElement | null;
  mangled: HTMLElement | null;
  key: HTMLElement | null;
  tally: Record<'sent' | 'dropped' | 'aborted', HTMLElement | null>;
};

function wait(ms: number, signal?: AbortSignal) {
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

/** Puts the rows in rank order and slides each one from where it was, so the bars are
    seen sorting themselves rather than the list being redrawn. */
function render(tool: Tool, result: SearchResult) {
  const { list, rows } = tool;
  const before = new Map<HTMLElement, number>();
  rows.forEach((row) => {
    if (!row.hidden) before.set(row, row.getBoundingClientRect().top);
  });

  const shown = new Set<string>();
  const ordered = result.hits.map((hit) => {
    const row = rows.get(hit.object.id)!;
    shown.add(hit.object.id);
    row.hidden = false;
    const relevance = row.querySelector<HTMLElement>('.relevance');
    relevance?.style.setProperty('--score', String(hit.score ?? 0));
    const value = row.querySelector<HTMLElement>('.value');
    // With no term there is no relevance column at all, rather than a NULL in it.
    if (value) value.textContent = result.terms.length ? formatScore(hit.score) : '';
    return row;
  });
  rows.forEach((row, id) => {
    if (!shown.has(id)) row.hidden = true;
  });
  // Hits first in rank order, the hidden rest after them; a node already in place is
  // left alone by append, so an unchanged order costs nothing.
  list.append(...ordered, ...[...rows.values()].filter((row) => row.hidden));
  if (tool.empty) {
    tool.empty.hidden = result.hits.length > 0;
    list.append(tool.empty);
  }

  if (tool.count) tool.count.textContent = `${result.hits.length} of ${libraryObjects.length} objects`;

  if (reducedMotion.matches) return;
  ordered.forEach((row) => {
    const from = before.get(row);
    if (from === undefined) {
      row.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MOVE_MS, easing: 'ease-out' });
      return;
    }
    const dy = from - row.getBoundingClientRect().top;
    if (Math.abs(dy) < 1) return;
    row.animate([{ translate: `0 ${dy}px` }, { translate: '0 0' }], {
      duration: MOVE_MS,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    });
  });
}

/**
 * The front end's request handling, the product's library_object_search.js in outline. It
 * searches on every keystroke: requests in flight are held in a map keyed by the serialised
 * form, a query identical to one in flight (or to the one on screen) is dropped outright, a
 * superseded one is aborted, and the survivor goes out behind a 50 ms leading-edge throttle.
 */
function requests(tool: Tool, onResult: (result: SearchResult) => void) {
  const inFlight = new Map<string, AbortController>();
  const counts = { sent: 0, dropped: 0, aborted: 0 };
  let onScreen = '';
  let lastSent = -Infinity;
  let pending: SearchState | null = null;
  let timer = 0;

  const tallied = (name: keyof typeof counts) => {
    counts[name] += 1;
    const el = tool.tally[name];
    if (el) el.textContent = String(counts[name]);
  };

  const send = async (state: SearchState) => {
    const key = serialise(state);
    const controller = new AbortController();
    inFlight.set(key, controller);
    lastSent = performance.now();
    tallied('sent');
    tool.root.dataset.loading = 'true';
    try {
      const result = await mockServer(state, controller.signal);
      onScreen = key;
      onResult(result);
    } catch {
      // Aborted: a newer query has taken its place.
    } finally {
      if (inFlight.get(key) === controller) inFlight.delete(key);
      if (!inFlight.size) delete tool.root.dataset.loading;
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
    if (tool.key) tool.key.textContent = `?${key}`;
    if (inFlight.has(key) || (!inFlight.size && !pending && key === onScreen)) {
      tallied('dropped');
      return;
    }
    inFlight.forEach((controller) => {
      controller.abort();
      tallied('aborted');
    });
    inFlight.clear();

    pending = state;
    const early = lastSent + THROTTLE_MS - performance.now();
    if (early <= 0 && !timer) flush();
    else if (!timer) timer = window.setTimeout(flush, Math.max(0, early));
  };

  return { request, shown: (state: SearchState) => (onScreen = serialise(state)) };
}

function readFilters(tool: Tool): Filters {
  const filters: Record<string, string> = {};
  tool.selects.forEach((select) => {
    if (select.value) filters[select.dataset.filter!] = select.value;
  });
  return filters;
}

function showState(tool: Tool, state: SearchState) {
  if (tool.input.value !== state.query) tool.input.value = state.query;
  tool.selects.forEach((select) => {
    const value = state.filters[select.dataset.filter as keyof Filters] ?? '';
    if (select.value !== value) select.value = value;
  });
  if (tool.mangled) tool.mangled.innerHTML = mangledHtml(state.query);
}

/**
 * The walkthrough: the query is typed a few letters at a time, the way a visitor would, so
 * every keystroke goes through the same throttle and abort as theirs. It pauses whenever the
 * sheet is not the page on top, and hands over on the first hover or focus, or when a
 * visitor types on one of the other sheets, which share the query: the script must not
 * append letters to a query that is theirs. It never takes the tool back on its own.
 * `data-autoplay` on the tool is the whole state, as `playing`, `user` or `off`, and the
 * sheet's transport deck shows the same (src/client/autoplayStatus.ts). Its keys drive it:
 * pause takes over as a visitor does, play hands back and reset starts again, both from the
 * query the page opens on.
 */
function autoplay(tool: Tool, script: readonly Step[], initial: SearchState, onChange: () => void) {
  const { root, input } = tool;
  if (reducedMotion.matches) {
    root.dataset.autoplay = 'off';
    reportAutoplayState(root, 'off');
    listenCount(tool, true);
    return null;
  }

  let run = 0;
  let active = false;
  watchPageActive(root, (next) => {
    active = next;
  });

  const setState = (state: 'playing' | 'user') => {
    root.dataset.autoplay = state;
    reportAutoplayState(root, state);
  };

  // Stops the script where it stands and leaves the tool to the visitor.
  const hold = () => {
    run += 1;
    setState('user');
    listenCount(tool, true);
  };
  const takeOver = () => {
    if (root.dataset.autoplay === 'playing') hold();
  };
  root.addEventListener('pointerenter', takeOver);
  root.addEventListener('focusin', takeOver);

  onAutoplayCommand(root, (command) => {
    if (command === 'pause') takeOver();
    else if (command === 'reset' || root.dataset.autoplay !== 'playing') void walk();
  });

  async function walk() {
    run += 1;
    const mine = run;
    const stopped = () => mine !== run;
    const pause = async (ms: number) => {
      await wait(ms);
      while (!stopped() && (!active || document.hidden)) await wait(250);
    };

    // Back to the query the page opens on; one already showing is left alone, as the
    // request pipeline would drop it anyway.
    if (serialise({ query: input.value, filters: readFilters(tool) }) !== serialise(initial)) {
      showState(tool, initial);
      onChange();
    }
    listenCount(tool, false);
    setState('playing');
    await pause(1600);

    while (!stopped()) {
      for (const step of script) {
        if (stopped()) break;
        if (step.clear) {
          input.value = '';
          onChange();
          await pause(400);
        }
        for (const char of step.type ?? '') {
          if (stopped()) break;
          input.value += char;
          onChange();
          await pause(char === ' ' ? 180 : 70 + Math.random() * 70);
        }
        if (step.color !== undefined && !stopped()) {
          const select = tool.selects.find((el) => el.dataset.filter === 'color');
          if (select) select.value = step.color;
          onChange();
        }
        await pause(step.hold);
      }
    }
  }

  return { takeOver, hold, walk };
}

export function initLibrarySearch(host: HTMLElement, root: HTMLElement) {
  const input = root.querySelector<HTMLInputElement>('.query-input');
  const list = root.querySelector<HTMLOListElement>('.results');
  if (!input || !list) return;

  const tool: Tool = {
    root,
    input,
    selects: [...root.querySelectorAll<HTMLSelectElement>('.filter-select')],
    list,
    rows: new Map([...list.querySelectorAll<HTMLElement>('.hit')].map((row) => [row.dataset.object!, row])),
    empty: list.querySelector<HTMLElement>('.no-hits'),
    count: root.querySelector<HTMLElement>('.count'),
    mangled: root.querySelector<HTMLElement>('.mangled'),
    key: root.querySelector<HTMLElement>('.requests .key'),
    tally: {
      sent: root.querySelector<HTMLElement>('[data-tally="sent"]'),
      dropped: root.querySelector<HTMLElement>('[data-tally="dropped"]'),
      aborted: root.querySelector<HTMLElement>('[data-tally="aborted"]'),
    },
  };

  const initial = initialState(root);
  const store = searchStore(host, initial);
  const pipeline = requests(tool, (result) => render(tool, result));
  // The build already drew the opening query's answer.
  pipeline.shown(initial);

  // The field and the filters both write to the stack's query; the other sheets read it.
  const onChange = () => {
    store.set({ query: input.value, filters: readFilters(tool) }, tool);
  };
  input.addEventListener('input', onChange);
  tool.selects.forEach((select) => select.addEventListener('change', onChange));

  const script = host.dataset.walkthrough;
  const walkthrough = script ? autoplay(tool, JSON.parse(script) as Step[], initial, onChange) : null;

  // A query from another sheet is the visitor's, wherever they typed it.
  store.subscribe((state, source) => {
    if (source !== tool) {
      walkthrough?.takeOver();
      showState(tool, state);
    } else if (tool.mangled) {
      tool.mangled.innerHTML = mangledHtml(state.query);
    }
    pipeline.request(state);
  });

  // Another sheet may have booted first and moved the query on.
  const state = store.get();
  const movedOn = serialise(state) !== serialise(initial);
  if (movedOn) {
    showState(tool, state);
    pipeline.request(state);
  }

  if (!walkthrough) listenCount(tool, true);
  else if (movedOn) walkthrough.hold();
  else void walkthrough.walk();
}

/** The count is a live region only while every change to it is the visitor's own: while
    the walkthrough types, a screen reader would hear it on every keystroke. */
function listenCount(tool: Tool, listen: boolean) {
  if (listen) tool.count?.setAttribute('role', 'status');
  else tool.count?.removeAttribute('role');
}
