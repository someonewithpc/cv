import { onAutoplayCommand, reportAutoplayState } from '@/client/autoplayStatus';
import { createCursorMover, type Point } from '@/client/cursorMotion';
import { watchPageActive } from '@/client/frontPage';
import { demoPress } from '@/components/TechnicalDrawing/demo-cursor-press';

import {
  matches,
  paxProperties,
  renderings,
  sample,
  searchableText,
  sizeProperties,
  splitSizes,
  storedSizeProperties,
  type SyntheticProperty,
} from '../units';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

/** The longest delay in SplitLayer.astro's `.running` animations, plus its duration. */
const RUN_MS = 1700;
/** The tip of the drawn arrow, as fractions of the cursor's box. */
const CURSOR_HOTSPOT = { x: 0.12, y: 0.08 };
/** Where on a field the cursor clicks before it types: near the start of the text. */
const FIELD_AIM = { x: 0.2, y: 0.55 };
const CURSOR_FADE_MS = 420;

type Step = { size: string; query: string };

type Tool = {
  root: HTMLElement;
  size: HTMLInputElement;
  pax: HTMLInputElement;
  query: HTMLInputElement;
  queryResult: HTMLElement;
  row: HTMLElement;
  rowVerdict: HTMLElement;
  chips: HTMLOListElement;
  renderings: HTMLUListElement;
  text: HTMLElement;
  /** The component's scoped-style attributes, so markup built here is styled like the
      markup Astro rendered. */
  scope: [string, string][];
  current: string;
};

function el<K extends keyof HTMLElementTagNameMap>(
  tool: Tool,
  tag: K,
  className?: string,
  text?: string,
) {
  const node = document.createElement(tag);
  tool.scope.forEach(([name, value]) => node.setAttribute(name, value));
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function renderChips(tool: Tool) {
  const dimensions = splitSizes(tool.size.value);
  tool.chips.replaceChildren(
    ...dimensions.map((dimension, index) => {
      const chip = el(tool, 'li', 'chip', dimension.raw);
      if (dimension.cm === null) chip.classList.add('invalid');
      chip.dataset.dim = String(index);
      chip.style.setProperty('--i', String(index));
      return chip;
    }),
  );
}

function renderRow(tool: Tool, property: SyntheticProperty, row: number, unit?: string) {
  const item = el(tool, 'li', 'rendering');
  item.style.setProperty('--row', String(row));
  if (unit) item.dataset.unit = unit;
  if (!unit) item.classList.add('pax');

  const value = el(tool, 'span', 'value');
  property.pieces.forEach((piece, index) => {
    if (index > 0) value.append(el(tool, 'span', 'by', ' by '));
    const span = el(tool, 'span', 'piece', piece);
    if (unit) {
      span.dataset.dim = String(index);
      span.style.setProperty('--i', String(index));
    }
    value.append(span);
  });
  const name = el(tool, 'span', 'name', unit ? renderings.find((r) => r.id === unit)!.short : property.name);
  if (unit) name.title = property.name;
  item.append(name, value);
  return item;
}

/** The text with every hit of `query` marked, built as nodes so nothing typed is ever
    read as markup. */
function renderText(tool: Tool, text: string, query: string) {
  const phrase = query.trim();
  if (!phrase || !matches(text, phrase)) {
    tool.text.textContent = text;
    return;
  }
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const pattern = new RegExp(`(?<!\\S)${escaped}(?!\\S)`, 'gi');
  const nodes: Node[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    nodes.push(document.createTextNode(text.slice(last, match.index)));
    nodes.push(el(tool, 'mark', undefined, match[0]));
    last = match.index + match[0].length;
  }
  nodes.push(document.createTextNode(text.slice(last)));
  tool.text.replaceChildren(...nodes);
}

function renderQueries(tool: Tool) {
  const text = tool.current;
  const query = tool.query.value.trim();
  if (!query) {
    tool.queryResult.textContent = '';
    tool.rowVerdict.textContent = '';
    delete tool.queryResult.dataset.hit;
    delete tool.row.dataset.hit;
  } else {
    const hit = matches(text, query);
    tool.queryResult.dataset.hit = String(hit);
    tool.row.dataset.hit = String(hit);
    tool.queryResult.textContent = hit ? '✓ found' : '✗ no match';
    tool.rowVerdict.textContent = hit ? `✓ ${query} found` : `✗ no match for ${query}`;
  }
  renderText(tool, text, query);
}

/** One run of the pipeline: split, fan out, concatenate, and run the search again. */
function runPipeline(tool: Tool, animate = true) {
  const sizes = sizeProperties(tool.size.value);
  const pax = paxProperties(tool.pax.value);

  renderChips(tool);
  tool.renderings.replaceChildren(
    ...sizes.map((property, row) => renderRow(tool, property, row, renderings[row].id)),
    ...pax.map((property, row) => renderRow(tool, property, sizes.length + row)),
  );
  tool.current = searchableText([...storedSizeProperties(tool.size.value), ...pax]);
  renderQueries(tool);

  if (!animate || reducedMotion.matches) return;
  // Restart the animations: drop the class, force a style flush, put it back.
  tool.root.classList.remove('running');
  void tool.root.offsetWidth;
  tool.root.classList.add('running');
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * The walkthrough types into the fields itself: a query that finds the sample, then each
 * size in turn with a query that finds it. A drawn cursor clicks each field before it
 * types. The fields are read-only, so the walkthrough is the only thing that changes them.
 * It runs only while the sheet is on screen and its page is on top. The transport deck's
 * keys pause it, play it and start it over; `data-autoplay` on the tool is its state, and
 * the deck is told the same through reportAutoplayState.
 */
function autoplay(tool: Tool, steps: readonly Step[]) {
  const { root } = tool;

  if (reducedMotion.matches) {
    root.dataset.autoplay = 'off';
    reportAutoplayState(root, 'off');
    return;
  }

  const cursor = document.createElement('span');
  cursor.className = 'demo-cursor';
  cursor.setAttribute('aria-hidden', 'true');
  cursor.dataset.demoCursor = '';
  cursor.hidden = true;
  root.append(cursor);
  const mover = createCursorMover(cursor, { hotspot: CURSOR_HOTSPOT });
  let fadeTimer = 0;

  const showCursor = () => {
    window.clearTimeout(fadeTimer);
    cursor.hidden = false;
    cursor.classList.remove('demo-cursor--fading');
  };

  const hideCursor = () => {
    window.clearTimeout(fadeTimer);
    if (cursor.hidden) return;
    cursor.classList.add('demo-cursor--fading');
    fadeTimer = window.setTimeout(() => {
      cursor.hidden = true;
      cursor.classList.remove('demo-cursor--fading');
    }, CURSOR_FADE_MS);
  };

  let token = 0;
  let active = false;
  let held = false;

  const pause = async (ms: number, run: number) => {
    await wait(ms);
    while (run === token && (!active || document.hidden)) await wait(250);
  };

  /** Scrolls the tool so `el` sits in the part the title block leaves clear. */
  const reveal = (el: HTMLElement) => {
    const box = root.getBoundingClientRect();
    const style = getComputedStyle(root);
    const top = box.top + parseFloat(style.paddingTop);
    const bottom = box.bottom - parseFloat(style.paddingBottom);
    const rect = el.getBoundingClientRect();
    if (rect.top >= top && rect.bottom <= bottom) return;
    root.scrollTop += rect.top - top - (bottom - top) / 4;
  };

  /** Where the cursor's tip goes to point at `at` on `el`, in the tool's scrolled box. */
  const pointOn = (el: HTMLElement, at = FIELD_AIM): Point => {
    const rect = el.getBoundingClientRect();
    const box = root.getBoundingClientRect();
    return {
      x: rect.left + rect.width * at.x - box.left - root.clientLeft + root.scrollLeft,
      y: rect.top + rect.height * at.y - box.top - root.clientTop + root.scrollTop,
    };
  };

  /** Moves the cursor onto `input` and clicks it, then types `text` a key at a time. The
      size field runs the pipeline and the query runs its search once each is typed. */
  const type = async (input: HTMLInputElement, text: string, run: number, onKey: () => void) => {
    reveal(input);
    const hop = mover.moveTo(pointOn(input));
    showCursor();
    await hop;
    if (run !== token) return;
    const rect = input.getBoundingClientRect();
    await demoPress(input, {
      x: rect.left + rect.width * FIELD_AIM.x,
      y: rect.top + rect.height * FIELD_AIM.y,
    });
    if (run !== token) return;
    input.classList.add('typing');
    input.value = '';
    onKey();
    await pause(260, run);
    for (let i = 1; i <= text.length && run === token; i += 1) {
      input.value = text.slice(0, i);
      onKey();
      await pause(90 + Math.random() * 60, run);
    }
    input.classList.remove('typing');
  };

  const play = async () => {
    const run = ++token;
    root.dataset.autoplay = 'playing';
    reportAutoplayState(root, 'playing');
    restore(tool);
    await pause(1200, run);

    // Each step types a size, lets the pipeline run, then asks for it in one of the
    // units it now carries. The old query stays up while the new size lands, so the
    // sheet shows it stop hitting before the new one does.
    while (run === token) {
      for (const step of steps) {
        if (tool.size.value !== step.size) {
          await type(tool.size, step.size, run, () => {});
          if (run !== token) return;
          runPipeline(tool);
          await pause(RUN_MS + 900, run);
          if (run !== token) return;
        }
        // The search runs once the query is typed, the way a search box sends it, so the
        // row does not flicker through a miss for every half-typed word.
        await type(tool.query, step.query, run, () => {
          tool.queryResult.textContent = '';
          delete tool.queryResult.dataset.hit;
        });
        if (run !== token) return;
        renderQueries(tool);
        await pause(2600, run);
        if (run !== token) return;
      }
    }
  };

  const stop = () => {
    token += 1;
    mover.cancel();
    hideCursor();
    root.querySelectorAll('.typing').forEach((input) => input.classList.remove('typing'));
    // A pause mid-word leaves the field half typed; the sheet is brought level with it so
    // the chips, the renderings and the hits agree with what the field says.
    runPipeline(tool, false);
  };

  watchPageActive(root, (next) => {
    active = next;
    if (!next) {
      window.clearTimeout(fadeTimer);
      cursor.hidden = true;
    } else if (!held && root.dataset.autoplay === 'playing') {
      showCursor();
    }
  });

  onAutoplayCommand(root, (command) => {
    if (command === 'pause') {
      if (root.dataset.autoplay !== 'playing') return;
      held = true;
      stop();
      root.dataset.autoplay = 'user';
      reportAutoplayState(root, 'user');
      return;
    }
    if (command === 'play' && root.dataset.autoplay === 'playing') return;
    held = false;
    stop();
    void play();
  });

  void play();
}

function restore(tool: Tool) {
  tool.size.value = sample.size;
  tool.pax.value = sample.pax;
  tool.query.value = '';
  runPipeline(tool, false);
}

export function initSyntheticProperties(host: HTMLElement, root: HTMLElement) {
  const find = <T extends Element>(selector: string) => root.querySelector<T>(selector)!;
  const tool: Tool = {
    root,
    size: find('.size-input'),
    pax: find('.pax-input'),
    query: find('.query-input'),
    queryResult: find('.query-result'),
    row: find('.text-row'),
    rowVerdict: find('.row-verdict'),
    chips: find('.chips'),
    renderings: find('.renderings'),
    text: find('.text'),
    scope: [...root.attributes]
      .filter((attribute) => attribute.name.startsWith('data-astro-cid-'))
      .map((attribute) => [attribute.name, attribute.value]),
    current: '',
  };

  // The fields are read-only. A click on one points the visitor at the line that says so.
  const note = root.querySelector<HTMLElement>('.inert-note');
  root.addEventListener('pointerdown', (event) => {
    if (!event.isTrusted || !note || !(event.target as Element).closest('input')) return;
    note.classList.remove('nudge');
    void note.offsetWidth;
    note.classList.add('nudge');
  });

  // Pointing at a chip lights the pieces it became, row by row.
  tool.chips.addEventListener('pointerover', (event) => {
    const chip = (event.target as Element).closest<HTMLElement>('.chip');
    if (chip?.dataset.dim) root.dataset.dimHover = chip.dataset.dim;
  });
  tool.chips.addEventListener('pointerleave', () => delete root.dataset.dimHover);

  runPipeline(tool, false);

  const script = host.dataset.walkthrough;
  if (script) autoplay(tool, JSON.parse(script) as Step[]);
}
