const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

type Group = {
  root: HTMLElement;
  shared: HTMLInputElement;
  submit: HTMLButtonElement;
  forms: HTMLFormElement[];
};

function memberInput(form: HTMLFormElement) {
  return form.querySelector<HTMLInputElement>('.in-place-input')!;
}

function mirror(group: Group) {
  const { shared } = group;
  const caret = shared.selectionStart ?? shared.value.length;

  group.forms.forEach((form) => {
    const input = memberInput(form);
    input.value = shared.value;
    input.scrollLeft = input.scrollWidth;
    form.style.setProperty('--caret', String(caret));
  });
}

function save(form: HTMLFormElement) {
  const input = memberInput(form);
  const value = input.value.trim();
  input.value = value;
  input.scrollLeft = 0;

  const card = form.closest<HTMLElement>('.image-thumbnail');
  if (!card) return;

  card.dataset.missing = String(value === '');
  card.classList.remove('saved');
  void card.offsetWidth;
  card.classList.add('saved');
}

function refreshShared(group: Group) {
  const values = new Set(group.forms.map((form) => memberInput(form).value));
  const mismatched = values.size > 1;

  group.shared.disabled = mismatched;
  group.submit.disabled = mismatched;
  group.shared.placeholder = mismatched ? 'mismatched' : 'Shared value';
  group.root.querySelector<HTMLElement>('.shared-row')!.title = mismatched
    ? 'This group has mismatched values, refusing to edit all of them'
    : 'Edit all the values in this group';

  group.shared.value = mismatched ? '' : [...values][0] ?? '';
}

function refreshDatalist(root: HTMLElement) {
  const list = root.querySelector<HTMLDataListElement>('datalist')!;
  const values = new Set(
    [...root.querySelectorAll<HTMLInputElement>('.image-thumbnail .in-place-input')]
      .map((input) => input.value)
      .filter(Boolean),
  );

  list.replaceChildren(
    ...[...values].sort().map((value) => Object.assign(document.createElement('option'), { value })),
  );
}

function submitAll(root: HTMLElement, group: Group) {
  group.forms.forEach(save);
  refreshShared(group);
  refreshDatalist(root);
}

function initGroup(root: HTMLElement, section: HTMLElement): Group {
  const group: Group = {
    root: section,
    shared: section.querySelector('.shared-value')!,
    submit: section.querySelector('.shared-submit')!,
    forms: [...section.querySelectorAll<HTMLFormElement>('.image-thumbnail form')],
  };

  group.shared.addEventListener('input', () => mirror(group));
  // Focus and click fire before the selection moves, so read it on the next tick.
  ['focus', 'click', 'keyup'].forEach((type) => {
    group.shared.addEventListener(type, () => setTimeout(() => mirror(group)));
  });
  group.shared.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') submitAll(root, group);
  });
  group.submit.addEventListener('click', () => submitAll(root, group));

  group.forms.forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      save(form);
      refreshShared(group);
      refreshDatalist(root);
    });
    memberInput(form).addEventListener('blur', () => form.requestSubmit());
  });

  return group;
}

function initPropertyEdit(root: HTMLElement) {
  const holder = root.querySelector<HTMLElement>('.property');
  if (!holder) return;

  const label = holder.querySelector<HTMLElement>('.in-place-label')!;
  const form = holder.querySelector<HTMLFormElement>('.in-place-form')!;
  const input = holder.querySelector<HTMLInputElement>('.in-place-input')!;

  const close = () => {
    holder.classList.remove('editing');
    input.value = label.textContent ?? '';
  };

  holder.querySelector('.in-place-pencil-btn')!.addEventListener('click', () => {
    holder.classList.add('editing');
    input.select();
    input.focus();
  });
  holder.querySelector('.in-place-cancel-btn')!.addEventListener('click', close);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = input.value.trim();
    if (value) label.textContent = value;
    close();
  });
}

function initFilter(root: HTMLElement) {
  const toggle = root.querySelector<HTMLInputElement>('.only-missing');
  if (!toggle) return;

  root.dataset.onlyMissing = String(toggle.checked);
  toggle.addEventListener('change', () => {
    root.dataset.onlyMissing = String(toggle.checked);
  });
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function autoplay(root: HTMLElement, group: Group, value: string) {
  if (reducedMotion.matches) return;

  let stopped = false;
  let visible = false;

  const stop = () => {
    stopped = true;
    group.root.classList.remove('autoplay');
    root.dataset.autoplay = 'off';
  };
  root.addEventListener('pointerenter', stop, { once: true });
  root.addEventListener('focusin', stop, { once: true });

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
  }, { threshold: 0.25 }).observe(root);

  const pause = async (ms: number) => {
    await wait(ms);
    while (!stopped && (!visible || document.hidden)) await wait(250);
  };

  const type = async (text: string) => {
    for (let i = 1; i <= text.length && !stopped; i++) {
      group.shared.value = text.slice(0, i);
      group.shared.setSelectionRange(i, i);
      mirror(group);
      await pause(text[i - 1] === ' ' ? 220 : 90 + Math.random() * 70);
    }
  };

  root.dataset.autoplay = 'on';
  await pause(1200);

  while (!stopped) {
    group.root.classList.add('autoplay');
    await pause(500);
    await type(value);
    await pause(900);
    if (stopped) break;

    submitAll(root, group);
    group.root.classList.remove('autoplay');
    await pause(3000);
    if (stopped) break;

    group.root.classList.add('autoplay');
    group.shared.value = '';
    group.shared.setSelectionRange(0, 0);
    mirror(group);
    await pause(700);
    if (stopped) break;

    submitAll(root, group);
    group.root.classList.remove('autoplay');
    await pause(1800);
  }
}

export function initTaggingTool(root: HTMLElement, autoplayValue: string) {
  const groups = [...root.querySelectorAll<HTMLElement>('.grouped-objects')].map((section) =>
    initGroup(root, section),
  );

  initPropertyEdit(root);
  initFilter(root);

  const target = groups.find((group) => group.root.hasAttribute('data-autoplay-target'));
  if (target) void autoplay(root, target, autoplayValue);
}
