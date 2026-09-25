import { onAutoplayCommand, reportAutoplayState } from '@/client/autoplayStatus';
import { watchPageActive } from '@/client/frontPage';

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

/** How long the input rests before the pipeline runs: one run per edit rather than one
    per keystroke, which would restart the animation on every letter. */
const SETTLE_MS = 220;
/** The longest delay in SplitLayer.astro's `.running` animations, plus its duration. */
const RUN_MS = 1700;

type Step = { size: string; query: string };

type Tool = {
  root: HTMLElement;
  size: HTMLInputElement;
  pax: HTMLInputElement;
  query: HTMLInputElement;
  queryResult: HTMLElement;
  chips: HTMLOListElement;
  renderings: HTMLUListElement;
  text: HTMLElement;
  queries: HTMLButtonElement[];
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
  tool.queries.forEach((button) => {
    const hit = matches(text, button.dataset.query ?? '');
    button.dataset.hit = String(hit);
    button.querySelector('.mark')!.textContent = hit ? '✓' : '✗';
    button.querySelector('.sr-only')!.textContent = hit ? 'hits' : 'misses';
  });

  const query = tool.query.value.trim();
  if (!query) {
    tool.queryResult.textContent = '';
    delete tool.queryResult.dataset.hit;
  } else {
    const hit = matches(text, query);
    tool.queryResult.dataset.hit = String(hit);
    tool.queryResult.textContent = hit ? '✓ hit' : '✗ no hit';
  }
  renderText(tool, text, query);
}

/** One run of the pipeline: split, fan out, concatenate, and ask the queries again. */
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
 * The walkthrough types into the fields a visitor would: a query that finds the sample,
 * then each size in turn with a query that finds it. It runs only while the sheet is on
 * screen and its page is on top, and stops the moment a real pointer or focus arrives,
 * until the transport deck's play key hands it back. `data-autoplay` on the tool is its
 * state, and the deck is told the same through reportAutoplayState.
 */
function autoplay(tool: Tool, steps: readonly Step[]) {
  const { root } = tool;

  if (reducedMotion.matches) {
    root.dataset.autoplay = 'off';
    reportAutoplayState(root, 'off');
    return;
  }

  let token = 0;
  let active = false;
  watchPageActive(root, (next) => {
    active = next;
  });

  const pause = async (ms: number, run: number) => {
    await wait(ms);
    while (run === token && (!active || document.hidden)) await wait(250);
  };

  /** Types `text` into `input` a key at a time. The size field runs the pipeline once
      it is done rather than per key; the query answers as it goes, as it does for a
      visitor. */
  const type = async (input: HTMLInputElement, text: string, run: number, onKey: () => void) => {
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
        await type(tool.query, step.query, run, () => renderQueries(tool));
        if (run !== token) return;
        await pause(2600, run);
        if (run !== token) return;
      }
    }
  };

  const stop = () => {
    if (root.dataset.autoplay !== 'playing') return;
    token += 1;
    root.querySelectorAll('.typing').forEach((input) => input.classList.remove('typing'));
    // A hover mid-word leaves the field half typed; the sheet is brought level with it so
    // the chips, the renderings and the hits agree with what the field says.
    runPipeline(tool, false);
    root.dataset.autoplay = 'user';
    reportAutoplayState(root, 'user');
  };

  root.addEventListener('pointerenter', stop);
  root.addEventListener('focusin', stop);
  onAutoplayCommand(root, (command) => {
    if (command === 'pause') stop();
    else void play();
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
    chips: find('.chips'),
    renderings: find('.renderings'),
    text: find('.text'),
    queries: [...root.querySelectorAll<HTMLButtonElement>('.query')],
    scope: [...root.attributes]
      .filter((attribute) => attribute.name.startsWith('data-astro-cid-'))
      .map((attribute) => [attribute.name, attribute.value]),
    current: '',
  };

  let timer = 0;
  const schedule = (animate = true) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => runPipeline(tool, animate), SETTLE_MS);
  };

  tool.size.addEventListener('input', () => schedule());
  tool.pax.addEventListener('input', () => schedule());
  // A query does not change the text, so it answers at once and nothing replays.
  tool.query.addEventListener('input', () => renderQueries(tool));

  tool.queries.forEach((button) => {
    button.addEventListener('click', () => {
      tool.query.value = button.dataset.query ?? '';
      renderQueries(tool);
    });
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
