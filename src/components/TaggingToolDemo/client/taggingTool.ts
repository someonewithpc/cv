import { onAutoplayCommand, reportAutoplayState } from '@/client/autoplayStatus';
import { demoGate } from '@/client/frontPage';
import { watchHandover } from '@/client/walkthroughHandover';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

type Values = Record<string, string | null>;

type Card = {
  root: HTMLElement;
  form: HTMLFormElement;
  input: HTMLInputElement;
  save: HTMLButtonElement;
  /** The card's bordered box, where its save ring plays. */
  ring: HTMLElement;
  values: Values;
  initial: Values;
};

type Group = {
  root: HTMLElement;
  sharedForm: HTMLFormElement;
  shared: HTMLInputElement;
  sharedSave: HTMLButtonElement;
  sharedSaveName: HTMLElement;
  /** The save button's accessible name while base and variants agree, rendered server side. */
  setLabel: string;
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
  /** null empties the card's field on the own-card step, the product's nil. */
  overrideValue: string | null;
  overrideIndex: number;
};

const SHARED_TITLE = 'Update base + variants';
const OVERRIDE_NOTE =
  'The objects in this group do not all have the same value. Saving here overwrites the variants with the base value.';

/** Rails' String#titleize, as far as the values here go. */
function titleize(text: string) {
  return text
    .trim()
    .replace(/[_\s]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const ruler = document.createElement('canvas').getContext('2d');

/** One character of the input's font, in px: what its ::before caret means by 1ch. */
function chWidth(input: HTMLInputElement) {
  if (!ruler) return parseFloat(getComputedStyle(input).fontSize) * 0.6;
  const { fontStyle, fontWeight, fontSize, fontFamily } = getComputedStyle(input);
  ruler.font = `${fontStyle} ${fontWeight} ${fontSize} ${fontFamily}`;
  return ruler.measureText('0').width;
}

/** The product's shared_inputs.js handler: copy the value into every variant form
    and tell its ::before caret where the shared input's caret is. The product then
    scrolls each input to its end, which on a card too narrow for the value shows its
    tail with the caret clamped to the far edge; this scrolls only as far as it takes to
    keep the caret in view, and tells the ::before how far that was. */
function mirror(group: Group, eventType = 'keyup') {
  const { shared } = group;
  const caret = shared.selectionStart ?? shared.value.length;

  group.cards.forEach(({ form, input }) => {
    form.style.setProperty('--caret', String(caret));
    input.value = shared.value;
    const ch = chWidth(input);
    const style = getComputedStyle(input);
    const textWidth = input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    input.scrollLeft = eventType === 'blur' ? 0 : Math.max(0, (caret + 1) * ch - textWidth);
    form.style.setProperty('--scroll', `${input.scrollLeft}px`);
    form.style.setProperty('--input-width', `${input.offsetWidth}px`);
  });
}

/** The mock server's round trip: nothing is stored, but a save takes as long to come
    back as one would. */
const SAVE_MS = 900;
/** $status-border-duration in src/scss/_statusBorder.scss: how long the ring takes to close. */
const RING_MS = 1000;
/** How long the closed ring rests before it sweeps back. */
const RING_REST_MS = 1000;

type RingState = 'idle' | 'pending' | 'success';

/** The pending loop eases in, then goes linear at the point where the bezier is already
    linear, so the orbit has no seam. The font picker's subform does the same. */
function armRing(el: HTMLElement) {
  el.addEventListener('animationstart', () => {
    setTimeout(() => el.style.setProperty('animation-timing-function', 'linear'), RING_MS * 0.75);
  });
  el.addEventListener('animationend', () => el.style.removeProperty('animation-timing-function'));
}

function ringState(el: HTMLElement, state: RingState | null) {
  el.classList.remove('idle', 'pending', 'success');
  if (state) el.classList.add(state);
}

/** A save as its ring reports it: pending orbits for the round trip, success sweeps the
    ring closed, then `commit` lands the values and the ring rests before sweeping back.
    Resolves once the values have landed. A save already in flight on `el` swallows the
    new one: the change and submit events of one press both come here. */
async function saving(el: HTMLElement, commit: () => void) {
  if (el.classList.contains('pending')) return;
  ringState(el, 'pending');
  await wait(SAVE_MS);
  ringState(el, 'success');
  await wait(RING_MS);
  commit();
  window.setTimeout(() => {
    if (el.classList.contains('success')) ringState(el, 'idle');
  }, RING_REST_MS);
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
}

/** _object.html.haml's shared_value: nothing set, or every object set to one value. */
function refreshShared(tool: Tool, group: Group) {
  const stored = group.cards
    .map((card) => card.values[tool.property])
    .filter((value): value is string => value != null);
  const distinct = [...new Set(stored)];
  const shared = stored.length === 0 || (stored.length === group.cards.length && distinct.length === 1);
  const placeholder = shared ? SHARED_TITLE : `Overrides: ${distinct.join(', ')}`;

  const title = shared ? SHARED_TITLE : `${SHARED_TITLE}\n${placeholder}\n${OVERRIDE_NOTE}`;

  group.sharedForm.dataset.shared = String(shared);
  group.sharedForm.title = title;
  group.sharedSave.title = title;
  group.sharedSaveName.textContent = shared ? group.setLabel : `${group.setLabel}. ${OVERRIDE_NOTE}`;
  group.shared.placeholder = placeholder;
  group.shared.value = shared ? (distinct[0] ?? '') : '';
  // Mirrors objects.ts's isComplete: set but still disagreeing is not done.
  group.root.dataset.complete = String(stored.length === group.cards.length && distinct.length === 1);
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
  return saving(group.root, () => {
    group.cards.forEach((card) => setValue(tool, card, group.shared.value));
    afterSave(tool, group, hide);
  });
}

function submitCard(tool: Tool, group: Group, card: Card, hide = true) {
  return saving(card.ring, () => {
    setValue(tool, card, card.input.value);
    afterSave(tool, group, hide);
  });
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
      ringState(card.ring, null);
    });
    group.root.classList.remove('autoplay');
    ringState(group.root, null);
  });
  showProperty(tool, tool.initialProperty);
}

function initGroup(tool: Tool, section: HTMLElement): Group {
  const cards = [...section.querySelectorAll<HTMLElement>('.image-thumbnail')].map((root) => {
    const values = JSON.parse(root.dataset.values ?? '{}') as Values;
    const ring = root.querySelector<HTMLElement>('.panel-preview-library-object')!;
    armRing(ring);
    return {
      root,
      form: root.querySelector<HTMLFormElement>('.object-form')!,
      input: root.querySelector<HTMLInputElement>('.object-value')!,
      save: root.querySelector<HTMLButtonElement>('.object-form button')!,
      ring,
      values,
      initial: { ...values },
    };
  });
  armRing(section);

  const sharedSave = section.querySelector<HTMLButtonElement>('.shared-form button')!;
  const group: Group = {
    root: section,
    sharedForm: section.querySelector('.shared-form')!,
    shared: section.querySelector('.shared-value')!,
    sharedSave,
    sharedSaveName: sharedSave.querySelector<HTMLElement>('.sr-only')!,
    setLabel: sharedSave.dataset.label ?? '',
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
    card.input.addEventListener('change', () => submitCard(tool, group, card));
    card.form.addEventListener('submit', (event) => {
      event.preventDefault();
      submitCard(tool, group, card);
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
 * The walkthrough: the page opens on a group whose objects disagree, so the shared field
 * is empty with the overrides in its placeholder and a warning for a tick. One value
 * typed there lands on the base and every variant, then one object is set on its own
 * card, emptied when the script says so, and the placeholder lists the overrides again.
 *
 * It only runs while the sheet is on screen and its page is the one drawn on top, which
 * `--page-index` answers and an IntersectionObserver cannot: every page of a stack shares
 * one grid cell. `data-autoplay` on the tool is the whole state, as `playing`, `user` or
 * `off`, and the sheet's transport deck shows the same state (src/client/autoplayStatus.ts).
 * The visitor takes the tool over and hands it back as watchHandover decides, and the
 * walkthrough then starts again from the rows the page opens on. The deck's keys do this
 * by hand: pause holds the tool past the quiet spell, play and reset start it again.
 */
async function autoplay(tool: Tool, host: HTMLElement, group: Group, script: Walkthrough) {
  const { root } = tool;
  const cursorEl = host.querySelector<HTMLElement>('.tagging-cursor');

  if (reducedMotion.matches || !cursorEl) {
    root.dataset.autoplay = 'off';
    reportAutoplayState(root, 'off');
    return;
  }

  const cursor: Cursor = { el: cursorEl, host, at: null };
  let run = 0;
  let active = false;
  let held = false;

  const setState = (state: 'playing' | 'user') => {
    root.dataset.autoplay = state;
    reportAutoplayState(root, state);
  };

  const gate = demoGate(root);
  gate.onChange((next) => {
    active = next;
  });

  const handover = watchHandover(root, {
    listening: () => active,
    takeOver() {
      run += 1;
      cursorEl.hidden = true;
      cursor.at = null;
      group.root.classList.remove('autoplay');
      setState('user');
    },
    handBack() {
      if (held) return false;
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

  await walk();

  async function walk() {
    const token = ++run;
    const stopped = () => token !== run;

    const pause = (ms: number) => gate.wait(ms);

    const type = async (input: HTMLInputElement, text: string, onKey: () => void) => {
      for (let i = 1; i <= text.length && !stopped(); i += 1) {
        input.value = text.slice(0, i);
        input.setSelectionRange(i, i);
        onKey();
        await pause(text[i - 1] === ' ' ? 200 : 85 + Math.random() * 60);
      }
    };

    setState('playing');
    await pause(1200);

    while (!stopped()) {
      restore(tool);
      await pause(500);
      if (stopped()) break;

      // The row disagrees with itself: three chair values over four objects. A pause on
      // the warning is what gives the placeholder time to be read.
      group.root.classList.add('autoplay');
      await aim(cursor, group.sharedSave);
      if (stopped()) break;
      await pause(1400);
      if (stopped()) break;

      // One value in the shared field tags the base object and every variant at once.
      await aim(cursor, group.shared, true);
      if (stopped()) break;
      await press(cursor);
      if (stopped()) break;
      await type(group.shared, script.value, () => mirror(group));
      await pause(700);
      if (stopped()) break;

      // The save is a click on the row's tick, not a silent commit: without the pointer
      // landing on the button, the values just change and nothing says why.
      await aim(cursor, group.sharedSave);
      if (stopped()) break;
      await press(cursor);
      if (stopped()) break;
      // The ring orbits for the round trip and closes before the values land. The ring is
      // the whole cue: the row does not fade out and back the way a row leaving the
      // product's list would, since here it stays for the next step.
      await submitShared(tool, group, false);
      if (stopped()) break;
      group.root.classList.remove('autoplay');
      await pause(1100);
      if (stopped()) break;

      // The row now agrees, so the shared field holds the value and the tick is back.
      await aim(cursor, group.sharedSave);
      if (stopped()) break;
      await pause(1200);
      if (stopped()) break;

      // One object is set on its own card, and the shared field goes back to listing
      // the overrides. An empty script value leaves the field cleared, which is how the
      // product's per-object input stores nil.
      const card = group.cards[script.overrideIndex] ?? group.cards[0];
      await aim(cursor, card.input, true);
      if (stopped()) break;
      await press(cursor);
      if (stopped()) break;
      card.input.value = '';
      await pause(260);
      await type(card.input, script.overrideValue ?? '', () => {});
      await pause(600);
      if (stopped()) break;

      await aim(cursor, card.save);
      if (stopped()) break;
      await press(cursor);
      if (stopped()) break;
      await submitCard(tool, group, card, false);
      await pause(2600);
    }
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
