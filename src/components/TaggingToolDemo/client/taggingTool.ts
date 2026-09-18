import { watchPageActive } from '@/client/frontPage';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

type Card = { root: HTMLElement; form: HTMLFormElement; input: HTMLInputElement };

type Group = {
  root: HTMLElement;
  sharedForm: HTMLFormElement;
  shared: HTMLInputElement;
  cards: Card[];
  initial: string[];
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

function setValue(card: Card, raw: string) {
  const value = raw.trim() === '' ? '' : titleize(raw);
  card.input.value = value;
  card.input.scrollLeft = 0;
  card.root.dataset.missing = String(value === '');
  card.root.classList.remove('saved');
  void card.root.offsetWidth;
  card.root.classList.add('saved');
}

/** _object.html.haml's shared_value: nothing set, or every object set to one value. */
function refreshShared(group: Group) {
  const values = group.cards.map((card) => card.input.value).filter((value) => value !== '');
  const distinct = [...new Set(values)];
  const shared = values.length === 0 || (values.length === group.cards.length && distinct.length === 1);
  const placeholder = shared ? SHARED_TITLE : `Overrides: ${distinct.join(', ')}`;

  group.sharedForm.dataset.shared = String(shared);
  group.sharedForm.title = shared ? SHARED_TITLE : `${SHARED_TITLE}\n${placeholder}`;
  group.shared.placeholder = placeholder;
  group.shared.value = shared ? distinct[0] ?? '' : '';
  group.root.dataset.complete = String(values.length === group.cards.length);
}

function refreshDatalist(root: HTMLElement) {
  const list = root.querySelector<HTMLDataListElement>('datalist')!;
  const select = root.querySelector<HTMLSelectElement>('.search-form select')!;
  const values = new Set(
    [...root.querySelectorAll<HTMLInputElement>('.object-value')].map((input) => input.value).filter(Boolean),
  );
  const sorted = [...values].sort();

  list.replaceChildren(...sorted.map((value) => Object.assign(document.createElement('option'), { value })));
  const current = select.value;
  select.replaceChildren(
    Object.assign(document.createElement('option'), { value: '' }),
    ...sorted.map((value) => Object.assign(document.createElement('option'), { value, textContent: value })),
  );
  select.value = sorted.includes(current) ? current : '';
}

type Tool = {
  root: HTMLElement;
  groups: Group[];
  search: string;
  note: HTMLElement | null;
};

/** The controller lists only objects still missing the property, unless a
    search is on; set.js.erb drops an object from the page once its last
    value lands. */
function applyVisibility(tool: Tool) {
  let hidden = 0;
  tool.groups.forEach((group) => {
    const complete = group.root.dataset.complete === 'true';
    const matches = tool.search === '' || group.cards.some((card) => card.input.value === tool.search);
    const show = tool.search === '' ? !complete : matches;
    group.root.hidden = !show;
    if (!show && tool.search === '') hidden += 1;
  });

  if (tool.note) {
    tool.note.hidden = hidden === 0;
    tool.note.querySelector('.hidden-count')!.textContent =
      hidden === 1 ? '1 object left the list once it was fully tagged.' : `${hidden} objects left the list once they were fully tagged.`;
  }
}

function afterSave(tool: Tool, group: Group) {
  refreshShared(group);
  refreshDatalist(tool.root);
  applyVisibility(tool);
}

function submitShared(tool: Tool, group: Group) {
  group.cards.forEach((card) => setValue(card, group.shared.value));
  afterSave(tool, group);
}

function initGroup(tool: Tool, section: HTMLElement): Group {
  const cards = [...section.querySelectorAll<HTMLElement>('.image-thumbnail')].map((root) => ({
    root,
    form: root.querySelector<HTMLFormElement>('.object-form')!,
    input: root.querySelector<HTMLInputElement>('.object-value')!,
  }));

  const group: Group = {
    root: section,
    sharedForm: section.querySelector('.shared-form')!,
    shared: section.querySelector('.shared-value')!,
    cards,
    initial: cards.map((card) => card.input.value),
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
      setValue(card, card.input.value);
      afterSave(tool, group);
    });
    card.form.addEventListener('submit', (event) => {
      event.preventDefault();
      setValue(card, card.input.value);
      afterSave(tool, group);
    });
  });

  return group;
}

function restore(group: Group) {
  group.cards.forEach((card, index) => {
    card.input.value = group.initial[index];
    card.root.dataset.missing = String(group.initial[index] === '');
    card.root.classList.remove('saved');
  });
  refreshShared(group);
}

function initHeader(tool: Tool) {
  const propertyForm = tool.root.querySelector<HTMLFormElement>('.property-form')!;
  const propertyInput = propertyForm.querySelector<HTMLInputElement>('input')!;
  let propertyName = propertyInput.value;
  propertyInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      propertyInput.blur();
    }
  });
  const saveProperty = () => {
    const value = propertyInput.value.trim().toLowerCase();
    propertyName = value || propertyName;
    propertyInput.value = propertyName;
  };
  propertyInput.addEventListener('change', saveProperty);
  propertyForm.addEventListener('submit', (event) => {
    event.preventDefault();
    saveProperty();
  });

  const searchForm = tool.root.querySelector<HTMLFormElement>('.search-form')!;
  const select = searchForm.querySelector<HTMLSelectElement>('select')!;
  const search = () => {
    tool.search = select.value;
    applyVisibility(tool);
  };
  select.addEventListener('change', search);
  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    search();
  });

  tool.note?.querySelector('.demo-reset')?.addEventListener('click', () => {
    tool.groups.forEach((group) => restore(group));
    refreshDatalist(tool.root);
    applyVisibility(tool);
  });
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * The walkthrough: type the value, save it, watch the object leave the list, put it back.
 *
 * It only runs while the sheet is on screen and its page is the one drawn on top, which
 * `--page-index` answers and an IntersectionObserver cannot: every page of a stack shares
 * one grid cell. `data-autoplay` on the tool is the whole state, as `playing`, `user` or
 * `off`, so a sheet-level transport deck can read or report it without new plumbing.
 */
async function autoplay(tool: Tool, group: Group, value: string) {
  const { root } = tool;

  if (reducedMotion.matches) {
    root.dataset.autoplay = 'off';
    return;
  }

  let stopped = false;
  let active = false;

  const stopPageWatch = watchPageActive(root, (next) => {
    active = next;
  });

  const stop = () => {
    stopped = true;
    stopPageWatch();
    group.root.classList.remove('autoplay', 'completing');
    root.dataset.autoplay = 'user';
  };
  root.addEventListener('pointerenter', stop, { once: true });
  root.addEventListener('focusin', stop, { once: true });

  const pause = async (ms: number) => {
    await wait(ms);
    while (!stopped && (!active || document.hidden)) await wait(250);
  };

  const type = async (text: string) => {
    for (let i = 1; i <= text.length && !stopped; i++) {
      group.shared.value = text.slice(0, i);
      group.shared.setSelectionRange(i, i);
      mirror(group);
      await pause(text[i - 1] === ' ' ? 220 : 90 + Math.random() * 70);
    }
  };

  root.dataset.autoplay = 'playing';
  await pause(1200);

  while (!stopped) {
    group.root.classList.add('autoplay');
    await pause(500);
    await type(value);
    await pause(900);
    if (stopped) break;

    // Enter: the field blurs, the form submits, the object is complete and leaves the list.
    submitShared(tool, group);
    group.root.classList.remove('autoplay');
    group.root.hidden = false;
    group.root.classList.add('completing');
    await pause(700);
    if (stopped) break;
    group.root.classList.remove('completing');
    applyVisibility(tool);
    await pause(2600);
    if (stopped) break;

    restore(group);
    refreshDatalist(root);
    applyVisibility(tool);
    await pause(1600);
  }
}

export function initTaggingTool(root: HTMLElement, autoplayValue: string) {
  const tool: Tool = {
    root,
    groups: [],
    search: '',
    note: root.querySelector<HTMLElement>('.demo-note'),
  };
  tool.groups = [...root.querySelectorAll<HTMLElement>('.grouped-objects')].map((section) =>
    initGroup(tool, section),
  );

  initHeader(tool);
  applyVisibility(tool);

  const target = tool.groups.find((group) => group.root.hasAttribute('data-autoplay-target'));
  if (target) void autoplay(tool, target, autoplayValue);
}
