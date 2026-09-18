import { watchPageActive } from '@/client/frontPage';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

type Values = Record<string, string | null>;

type Card = {
  root: HTMLElement;
  form: HTMLFormElement;
  input: HTMLInputElement;
  save: HTMLButtonElement;
  values: Values;
  initial: Values;
};

type Group = {
  root: HTMLElement;
  sharedForm: HTMLFormElement;
  shared: HTMLInputElement;
  sharedSave: HTMLButtonElement;
  cards: Card[];
};

type Tool = {
  root: HTMLElement;
  select: HTMLSelectElement;
  list: HTMLDataListElement;
  groups: Group[];
  property: string;
  initialProperty: string;
  note: HTMLElement | null;
};

/** The script the walkthrough plays, handed over from objects.ts by GridLayer.astro. */
type Walkthrough = {
  value: string;
  storedProperty: string;
  overrideValue: string;
  overrideIndex: number;
};

const SHARED_TITLE = 'Update Base + Styles';

/** Rails' String#titleize, as far as the values here go. */
function titleize(text: string) {
  return text
    .trim()
    .replace(/[_\s]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** The product's shared_inputs.js handler: copy the value into every style form
    and tell its ::before caret where the shared input's caret is. */
function mirror(group: Group, eventType = 'keyup') {
  const { shared } = group;
  const selectionStart = shared.selectionStart ?? shared.value.length;
  const caret = Math.max(selectionStart, shared.value.lastIndexOf(' ', selectionStart));

  group.cards.forEach(({ form, input }) => {
    form.style.setProperty('--caret', String(caret));
    input.value = shared.value;
    input.scrollLeft = eventType === 'blur' ? 0 : input.scrollWidth;
    form.style.setProperty('--input-width', `${input.offsetWidth}px`);
  });
}

function flash(card: Card) {
  card.root.classList.remove('saved');
  void card.root.offsetWidth;
  card.root.classList.add('saved');
}

function showValue(tool: Tool, card: Card) {
  const value = card.values[tool.property] ?? '';
  card.input.value = value;
  card.input.scrollLeft = 0;
  card.root.dataset.missing = String(value === '');
}

function setValue(tool: Tool, card: Card, raw: string) {
  card.values[tool.property] = raw.trim() === '' ? null : titleize(raw);
  showValue(tool, card);
  flash(card);
}

/** _object.html.haml's shared_value: nothing set, or every object set to one value. */
function refreshShared(tool: Tool, group: Group) {
  const stored = group.cards
    .map((card) => card.values[tool.property])
    .filter((value): value is string => value != null);
  const distinct = [...new Set(stored)];
  const shared = stored.length === 0 || (stored.length === group.cards.length && distinct.length === 1);
  const placeholder = shared ? SHARED_TITLE : `Overrides: ${distinct.join(', ')}`;

  group.sharedForm.dataset.shared = String(shared);
  group.sharedForm.title = shared ? SHARED_TITLE : `${SHARED_TITLE}\n${placeholder}`;
  group.shared.placeholder = placeholder;
  group.shared.value = shared ? (distinct[0] ?? '') : '';
  group.root.dataset.complete = String(stored.length === group.cards.length);
}

function refreshDatalist(tool: Tool) {
  const values = new Set<string>();
  tool.groups.forEach((group) => {
    group.cards.forEach((card) => {
      const value = card.values[tool.property];
      if (value) values.add(value);
    });
  });
  tool.list.replaceChildren(
    ...[...values].sort().map((value) => Object.assign(document.createElement('option'), { value })),
  );
}

/** The page lists only objects still missing the property; set.js.erb drops one from
    the page once its last value lands. */
function applyVisibility(tool: Tool) {
  let hidden = 0;
  tool.groups.forEach((group) => {
    const complete = group.root.dataset.complete === 'true';
    group.root.hidden = complete;
    if (complete) hidden += 1;
  });

  if (tool.note) {
    tool.note.hidden = hidden === 0;
    tool.note.querySelector('.hidden-count')!.textContent =
      hidden === 1
        ? '1 object left the list once it was fully tagged.'
        : `${hidden} objects left the list once they were fully tagged.`;
  }
}

function afterSave(tool: Tool, group: Group, hide = true) {
  refreshShared(tool, group);
  refreshDatalist(tool);
  if (hide) applyVisibility(tool);
}

function submitShared(tool: Tool, group: Group, hide = true) {
  group.cards.forEach((card) => setValue(tool, card, group.shared.value));
  afterSave(tool, group, hide);
}

/** Redraw every row for the property the picker is on. */
function showProperty(tool: Tool, property: string) {
  tool.property = property;
  tool.root.dataset.property = property;
  tool.select.value = property;
  tool.groups.forEach((group) => {
    group.cards.forEach((card) => showValue(tool, card));
    refreshShared(tool, group);
  });
  refreshDatalist(tool);
  applyVisibility(tool);
}

function restore(tool: Tool) {
  tool.groups.forEach((group) => {
    group.cards.forEach((card) => {
      card.values = { ...card.initial };
      card.root.classList.remove('saved');
    });
    group.root.classList.remove('autoplay', 'completing');
  });
  showProperty(tool, tool.initialProperty);
}

function initGroup(tool: Tool, section: HTMLElement): Group {
  const cards = [...section.querySelectorAll<HTMLElement>('.image-thumbnail')].map((root) => {
    const values = JSON.parse(root.dataset.values ?? '{}') as Values;
    return {
      root,
      form: root.querySelector<HTMLFormElement>('.object-form')!,
      input: root.querySelector<HTMLInputElement>('.object-value')!,
      save: root.querySelector<HTMLButtonElement>('.object-form button')!,
      values,
      initial: { ...values },
    };
  });

  const group: Group = {
    root: section,
    sharedForm: section.querySelector('.shared-form')!,
    shared: section.querySelector('.shared-value')!,
    sharedSave: section.querySelector('.shared-form button')!,
    cards,
  };

  // Product: keyup/focus/click/blur. `input` too, so pasted or filled text mirrors as well.
  ['keyup', 'focus', 'click', 'blur', 'input'].forEach((type) => {
    group.shared.addEventListener(type, () => mirror(group, type));
  });

  // auto_submit_form: the form submits on change, and Enter blurs the field.
  group.shared.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      group.shared.blur();
    }
  });
  group.shared.addEventListener('change', () => submitShared(tool, group));
  group.sharedForm.addEventListener('submit', (event) => {
    event.preventDefault();
    submitShared(tool, group);
  });

  cards.forEach((card) => {
    card.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        card.input.blur();
      }
    });
    card.input.addEventListener('change', () => {
      setValue(tool, card, card.input.value);
      afterSave(tool, group);
    });
    card.form.addEventListener('submit', (event) => {
      event.preventDefault();
      setValue(tool, card, card.input.value);
      afterSave(tool, group);
    });
  });

  return group;
}

function initHeader(tool: Tool) {
  tool.select.addEventListener('change', () => showProperty(tool, tool.select.value));
  tool.note?.querySelector('.demo-reset')?.addEventListener('click', () => restore(tool));
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** Matches the cursor's left/top transition in GridLayer.astro. */
const TRAVEL_MS = 520;

type Cursor = {
  el: HTMLElement;
  host: HTMLElement;
  at: { x: number; y: number } | null;
};

/** Moves the drawn cursor into `target`: a text field is aimed near its left edge, the
    way a hand clicks before typing, anything else at its middle. */
async function aim(cursor: Cursor, target: HTMLElement, atText = false) {
  const box = target.getBoundingClientRect();
  const host = cursor.host.getBoundingClientRect();
  const to = {
    x: box.left - host.left + (atText ? Math.min(box.width * 0.25, 28) : box.width / 2),
    y: box.top - host.top + box.height / 2,
  };
  const from = cursor.at;
  cursor.at = to;
  cursor.el.hidden = false;
  cursor.el.style.left = `${to.x}px`;
  cursor.el.style.top = `${to.y}px`;
  await wait(!from || Math.hypot(to.x - from.x, to.y - from.y) > 6 ? TRAVEL_MS : 60);
}

async function press(cursor: Cursor) {
  cursor.el.classList.add('clicking');
  await wait(140);
  cursor.el.classList.remove('clicking');
}

/**
 * The walkthrough: tag a whole object through the shared field, switch to a property
 * that already has values so every field fills on the way in, then override one style
 * by hand.
 *
 * It only runs while the sheet is on screen and its page is the one drawn on top, which
 * `--page-index` answers and an IntersectionObserver cannot: every page of a stack shares
 * one grid cell. `data-autoplay` on the tool is the whole state, as `playing`, `user` or
 * `off`, so a sheet-level transport deck can read or report it without new plumbing.
 */
async function autoplay(tool: Tool, host: HTMLElement, group: Group, script: Walkthrough) {
  const { root } = tool;
  const cursorEl = host.querySelector<HTMLElement>('.tagging-cursor');

  if (reducedMotion.matches || !cursorEl) {
    root.dataset.autoplay = 'off';
    return;
  }

  const cursor: Cursor = { el: cursorEl, host, at: null };
  let stopped = false;
  let active = false;

  const stopPageWatch = watchPageActive(root, (next) => {
    active = next;
  });

  const stop = () => {
    stopped = true;
    stopPageWatch();
    cursorEl.hidden = true;
    group.root.classList.remove('autoplay', 'completing');
    root.dataset.autoplay = 'user';
  };
  root.addEventListener('pointerenter', stop, { once: true });
  root.addEventListener('focusin', stop, { once: true });

  const pause = async (ms: number) => {
    await wait(ms);
    while (!stopped && (!active || document.hidden)) await wait(250);
  };

  const type = async (input: HTMLInputElement, text: string, onKey: () => void) => {
    for (let i = 1; i <= text.length && !stopped; i += 1) {
      input.value = text.slice(0, i);
      input.setSelectionRange(i, i);
      onKey();
      await pause(text[i - 1] === ' ' ? 200 : 85 + Math.random() * 60);
    }
  };

  root.dataset.autoplay = 'playing';
  await pause(1200);

  while (!stopped) {
    restore(tool);
    await pause(500);
    if (stopped) break;

    // One value in the shared field tags the base object and every style at once.
    group.root.classList.add('autoplay');
    await aim(cursor, group.shared, true);
    if (stopped) break;
    await press(cursor);
    await type(group.shared, script.value, () => mirror(group));
    await pause(700);
    if (stopped) break;

    // The save is a click on the row's tick, not a silent commit: without the pointer
    // landing on the button, the values just change and nothing says why.
    await aim(cursor, group.sharedSave);
    if (stopped) break;
    await press(cursor);
    submitShared(tool, group, false);
    group.root.classList.remove('autoplay');
    group.root.classList.add('completing');
    await pause(1100);
    if (stopped) break;

    // A property that already has values fills every field on the way in.
    group.root.classList.remove('completing');
    await aim(cursor, tool.select);
    if (stopped) break;
    await press(cursor);
    showProperty(tool, script.storedProperty);
    await pause(1400);
    if (stopped) break;

    // One style disagrees, so it is changed on its own card.
    const card = group.cards[script.overrideIndex] ?? group.cards[0];
    await aim(cursor, card.input, true);
    if (stopped) break;
    await press(cursor);
    card.input.value = '';
    await pause(260);
    await type(card.input, script.overrideValue, () => {});
    await pause(600);
    if (stopped) break;

    await aim(cursor, card.save);
    if (stopped) break;
    await press(cursor);
    setValue(tool, card, card.input.value);
    afterSave(tool, group, false);
    await pause(2600);
  }
}

export function initTaggingTool(host: HTMLElement, root: HTMLElement) {
  const select = root.querySelector<HTMLSelectElement>('.property-select');
  const list = root.querySelector<HTMLDataListElement>('datalist');
  if (!select || !list) return;

  const tool: Tool = {
    root,
    select,
    list,
    groups: [],
    property: root.dataset.property ?? select.value,
    initialProperty: root.dataset.property ?? select.value,
    note: root.querySelector<HTMLElement>('.demo-note'),
  };
  tool.groups = [...root.querySelectorAll<HTMLElement>('.grouped-objects')].map((section) =>
    initGroup(tool, section),
  );

  initHeader(tool);
  applyVisibility(tool);

  const target = tool.groups.find((group) => group.root.hasAttribute('data-autoplay-target'));
  const script = host.dataset.walkthrough;
  if (target && script) void autoplay(tool, host, target, JSON.parse(script) as Walkthrough);
}
