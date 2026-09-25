import { onAutoplayCommand, reportAutoplayState } from '@/client/autoplayStatus';
import { createCursorMover, type Point } from '@/client/cursorMotion';
import { watchPageActive } from '@/client/frontPage';
import { watchHandover } from '@/client/walkthroughHandover';
import { demoPress } from '@/components/TechnicalDrawing/demo-cursor-press';

import { libraryObjects } from '../objects';
import { formatScore, search, serialise, type Filters, type SearchResult, type SearchState } from '../search';
import { initialState, searchStore, type RequestLog } from './store';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

/** The leading-edge throttle in front of the request. */
const THROTTLE_MS = 50;
/** How long the mock server takes to answer, low and high. */
const LATENCY_MS = [90, 260] as const;
/** Matches the bar's scale transition in SearchTool.astro. */
const MOVE_MS = 350;
/** The tip of the drawn arrow, as fractions of the cursor's box. */
const CURSOR_HOTSPOT = { x: 0.12, y: 0.08 };
/** A hand rests a moment on a control before it presses. */
const PRESS_DELAY_MS = 160;
/** One backspace, while the script empties the field. */
const BACKSPACE_MS = 35;
/** How long an opened list shows before the hand heads for its option. */
const LIST_OPEN_MS = 450;

type Step = { type?: string; clear?: boolean; color?: string; category?: string; hold: number };

type Tool = {
  root: HTMLElement;
  input: HTMLInputElement;
  selects: HTMLSelectElement[];
  list: HTMLOListElement;
  rows: Map<string, HTMLElement>;
  empty: HTMLElement | null;
  count: HTMLElement | null;
  options: HTMLUListElement | null;
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
 * What it does is reported to `onLog`, which the Generated SQL sheet prints.
 */
function requests(
  tool: Tool,
  initial: SearchState,
  onResult: (result: SearchResult) => void,
  onLog: (log: RequestLog) => void,
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
    tool.root.dataset.loading = 'true';
    try {
      const result = await mockServer(state, controller.signal);
      onScreen = key;
      onResult(result);
      tool.root.dataset.answered = key;
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
    tool.root.dataset.answered = onScreen;
  };

  return { request, shown };
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
}

/**
 * The walkthrough's hand: the drawn cursor the other demos use, moved by cursorMotion.ts and
 * pressed through demoPress, so it pulses and flares the same way theirs does. Every change
 * the script makes starts with it: it clicks into the field before it types or empties it,
 * and clicks a filter open, then the option in its drawn list, before that filter changes.
 * The control it works wears the focus ring while it does, without the focus, which would
 * hand the tool to the visitor.
 */
function drawnHand(host: HTMLElement, el: HTMLElement, list: HTMLUListElement | null) {
  const mover = createCursorMover(el, { hotspot: CURSOR_HOTSPOT });
  let working: HTMLElement | null = null;

  /** Where on the host the tip lands to be at `at` on `target`. The sheet may be drawn
      scaled, and the cursor moves in the host's own pixels. */
  const pointOn = (target: HTMLElement, at: Point): Point => {
    const box = target.getBoundingClientRect();
    const frame = host.getBoundingClientRect();
    const scale = frame.width / (host.offsetWidth || frame.width) || 1;
    return {
      x: (box.left + box.width * at.x - frame.left) / scale,
      y: (box.top + box.height * at.y - frame.top) / scale,
    };
  };

  const work = (target: HTMLElement | null) => {
    if (working === target) return;
    working?.removeAttribute('data-demo-focus');
    working = target;
    working?.setAttribute('data-demo-focus', '');
  };

  /** Moves onto `target`, rests, and presses it. Resolves once the press is over. */
  const press = async (target: HTMLElement, at: Point, stopped: () => boolean) => {
    const to = pointOn(target, at);
    if (el.hidden) {
      mover.jumpTo(to);
      el.hidden = false;
    } else {
      await mover.moveTo(to);
    }
    if (stopped()) return;
    await wait(PRESS_DELAY_MS);
    if (stopped()) return;
    const box = target.getBoundingClientRect();
    await demoPress(target, { x: box.left + box.width * at.x, y: box.top + box.height * at.y }, { click: false });
  };

  const close = () => {
    if (!list) return;
    list.hidden = true;
    list.replaceChildren();
  };

  /** Draws `select`'s options under it, the current one lit, as its own list would. */
  const open = (select: HTMLSelectElement) => {
    if (!list) return [];
    const items = [...select.options].map((option) => {
      const item = document.createElement('li');
      item.textContent = option.text;
      item.dataset.value = option.value;
      if (option.selected) {
        item.dataset.selected = '';
        item.dataset.hover = '';
      }
      return item;
    });
    list.replaceChildren(...items);
    list.hidden = false;

    // In the tool's own pixels: the sheet may be drawn scaled.
    const root = list.offsetParent as HTMLElement;
    const frame = root.getBoundingClientRect();
    const scale = frame.width / (root.offsetWidth || frame.width) || 1;
    const box = select.getBoundingClientRect();
    const top = (box.bottom - frame.top) / scale - root.clientTop + 2;
    list.style.minWidth = `${select.offsetWidth}px`;
    list.style.maxHeight = `${Math.max(0, root.clientHeight - top - 4)}px`;
    list.style.top = `${top}px`;
    const left = (box.left - frame.left) / scale - root.clientLeft;
    list.style.left = `${Math.max(4, Math.min(left, root.clientWidth - list.offsetWidth - 4))}px`;
    return items;
  };

  return {
    press: async (target: HTMLElement, at: Point, stopped: () => boolean) => {
      await press(target, at, stopped);
      if (!stopped()) work(target);
    },
    /** Clicks `select` open, moves down its list to `value` and clicks that, which is
        when `pick` sets it, then closes the list. Resolves false if the run stopped first. */
    async choose(select: HTMLSelectElement, value: string, stopped: () => boolean, pick: () => void) {
      await press(select, { x: 0.5, y: 0.55 }, stopped);
      if (stopped()) return false;
      work(select);
      const items = open(select);
      const item = items.find((option) => option.dataset.value === value);
      if (!item) {
        close();
        return false;
      }
      await wait(LIST_OPEN_MS);
      if (stopped()) return false;
      if (list && (item.offsetTop < list.scrollTop || item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight)) {
        list.scrollTop = item.offsetTop - list.clientHeight / 2;
      }
      await mover.moveTo(pointOn(item, { x: 0.35, y: 0.6 }));
      if (stopped()) return false;
      items.forEach((option) => option.toggleAttribute('data-hover', option === item));
      await press(item, { x: 0.35, y: 0.6 }, stopped);
      if (stopped()) return false;
      pick();
      close();
      return true;
    },
    close,
    hide() {
      mover.cancel();
      el.hidden = true;
      close();
      work(null);
    },
  };
}

/**
 * The walkthrough: the query is typed a few letters at a time, the way a visitor would, so
 * every keystroke goes through the same throttle and abort as theirs. It pauses whenever the
 * sheet is not the page on top. The visitor takes the tool over as watchHandover decides (a
 * moving pointer, a tap or focus; a resting pointer does not), and so does a query typed on
 * one of the other sheets, which share it. After a quiet spell the script starts again from
 * the query the page opens on. `data-autoplay` on the tool is the whole state, as `playing`,
 * `user` or `off`, and the sheet's transport deck shows the same (src/client/autoplayStatus.ts).
 * Its keys drive it: pause holds the tool for the visitor, play and reset start the script
 * again from the opening query.
 */
function autoplay(tool: Tool, host: HTMLElement, script: readonly Step[], initial: SearchState, onChange: () => void) {
  const { root, input } = tool;
  const cursorEl = host.querySelector<HTMLElement>('[data-demo-cursor]');
  if (reducedMotion.matches || !cursorEl) {
    root.dataset.autoplay = 'off';
    reportAutoplayState(root, 'off');
    listenCount(tool, true);
    return null;
  }

  const hand = drawnHand(host, cursorEl, tool.options);
  let run = 0;
  let active = false;
  let held = false;
  watchPageActive(root, (next) => {
    active = next;
  });

  const setState = (state: 'playing' | 'user') => {
    root.dataset.autoplay = state;
    reportAutoplayState(root, state);
  };

  const handover = watchHandover(root, {
    listening: () => active,
    // Stops the script where it stands and leaves the tool to the visitor.
    takeOver() {
      run += 1;
      hand.hide();
      setState('user');
      listenCount(tool, true);
    },
    handBack() {
      if (held || !active) return false;
      void walk();
      return true;
    },
  });

  onAutoplayCommand(root, (command) => {
    if (command === 'pause') {
      held = true;
      handover.takeOver();
      return;
    }
    held = false;
    handover.release();
    if (command === 'play' && root.dataset.autoplay === 'playing') return;
    void walk();
  });

  async function walk() {
    run += 1;
    const mine = run;
    const stopped = () => mine !== run;
    const pause = async (ms: number) => {
      await wait(ms);
      while (!stopped() && (!active || document.hidden)) await wait(250);
    };

    hand.close();
    // Back to the query the page opens on. Only the deck's keys and the hand back after a
    // quiet spell get here with another query showing, and they are its cause.
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
        if (step.clear || step.type) {
          // Aimed right of the text, so the arrow never covers what it types.
          await hand.press(input, { x: 0.8, y: 0.55 }, stopped);
          if (stopped()) break;
        }
        if (step.clear) {
          while (input.value && !stopped()) {
            input.value = input.value.slice(0, -1);
            onChange();
            await pause(BACKSPACE_MS);
          }
          await pause(300);
        }
        for (const char of step.type ?? '') {
          if (stopped()) break;
          input.value += char;
          onChange();
          await pause(char === ' ' ? 180 : 70 + Math.random() * 70);
        }
        for (const filter of ['category', 'color'] as const) {
          const value = step[filter];
          const select = tool.selects.find((el) => el.dataset.filter === filter);
          if (value === undefined || !select || stopped()) continue;
          const picked = await hand.choose(select, value, stopped, () => {
            select.value = value;
            onChange();
          });
          if (!picked) break;
        }
        if (stopped()) break;
        await pause(step.hold);
      }
    }
  }

  return {
    /** A query typed on another sheet: the visitor has the tool now. */
    takeOver: () => handover.takeOver(),
    walk,
  };
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
    options: root.querySelector<HTMLUListElement>('[data-demo-options]'),
  };

  const initial = initialState(root);
  const store = searchStore(host, initial);
  const pipeline = requests(tool, initial, (result) => render(tool, result), (log) => store.setLog(log));
  // The build already drew the opening query's answer.
  pipeline.shown(initial);

  // The field and the filters both write to the stack's query; the other sheets read it.
  const onChange = () => {
    store.set({ query: input.value, filters: readFilters(tool) }, tool);
  };
  input.addEventListener('input', onChange);
  tool.selects.forEach((select) => select.addEventListener('change', onChange));

  const script = host.dataset.walkthrough;
  const walkthrough = script ? autoplay(tool, host, JSON.parse(script) as Step[], initial, onChange) : null;

  // A query from another sheet is the visitor's, wherever they typed it.
  store.subscribe((state, source) => {
    if (source !== tool) {
      walkthrough?.takeOver();
      showState(tool, state);
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
  else if (movedOn) walkthrough.takeOver();
  else void walkthrough.walk();
}

/** The count is a live region only while every change to it is the visitor's own: while
    the walkthrough types, a screen reader would hear it on every keystroke. */
function listenCount(tool: Tool, listen: boolean) {
  if (listen) tool.count?.setAttribute('role', 'status');
  else tool.count?.removeAttribute('role');
}
