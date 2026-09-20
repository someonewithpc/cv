import { ADD_GOOGLE_FONT, EXTRACT_FROM_URL } from './FontFamily';
import { demoPicker } from './demoPicker';
import { type Run, type Scene, setNativeValue } from './playthrough';

const GOOGLE_FONT = 'Lobster';
// A well-known page whose face could not look less like Poppins
const EMBED_URL = 'rust-lang.org';
const EMBED_FAMILY = 'Alfa Slab One';
// The weight slider only tells on a variable face, and this page has one
const VARIABLE_FONT_URL = 'astro.build';
const VARIABLE_FAMILY = 'Obviously';

const target = <T extends HTMLElement>(root: HTMLElement, name: string) => {
  const el = root.querySelector<T>(`[data-demo-target="${name}"]`);
  if (!el) throw new Error(`no demo target ${name}`);
  return el;
};

const status = (input: HTMLInputElement) => () => input.closest('fieldset')?.className.match(/\b(pending|success|error)\b/)?.[1];

// The fieldset reports on the debounced query, so right after typing it still shows the
// verdict on a half-typed value, and a host that does not exist fails fast. Wait for the
// query the whole value starts, then for what it says
async function settle(run: Run, input: HTMLInputElement, timeoutMs: number) {
  const current = status(input);
  await run.until(() => current() === 'pending', 1500);
  await run.until(() => current() !== 'pending', timeoutMs);
}

// The option for a family, by the label's start: "Special Elite" finds "Special Elite 400"
const optionFor = (select: HTMLSelectElement, family: string) =>
  [...select.options].find((option) => option.label.startsWith(family))?.value;

/** Open the drawn list, hover down it previewing faces on the way, and choose one */
async function pickFromList(run: Run, root: HTMLElement, value: string, hoverFirst: string[] = []) {
  const select = target<HTMLSelectElement>(root, 'family');
  const values = [...select.options].map((option) => option.value);
  const items = () => [...document.querySelectorAll<HTMLLIElement>('.font-picker-demo-picker li')];

  // Landing on a subform entry commits no face, so rows swept over on the way there
  // shouldn't preview either
  const isSubformEntry = value === ADD_GOOGLE_FONT || value === EXTRACT_FROM_URL;

  await run.press(select);
  demoPicker.open(!isSubformEntry);
  await run.wait(400);

  // A row out of the list's scroll is wheeled into view first, as a hand would
  const row = (index: number) => {
    const item = items()[index];
    item.scrollIntoView({ block: 'nearest' });
    return item;
  };

  // Farthest preview first, so each stop is closer to the pick than the last: the cursor
  // never has to cross a row it already lingered on to get there
  const targetIndex = values.indexOf(value);
  const ordered = [...hoverFirst].sort((a, b) => Math.abs(values.indexOf(b) - targetIndex) - Math.abs(values.indexOf(a) - targetIndex));

  for (const hovered of [...ordered, value]) {
    const index = values.indexOf(hovered);
    if (index < 0) continue;
    await run.moveTo(row(index));
    await run.wait(hovered === value ? 550 : 650);
  }

  if (targetIndex >= 0) {
    await run.press(row(targetIndex));
    setNativeValue(select, value);
  }
  run.leave();
  demoPicker.close();
  await run.wait(600);
}

// A subform still showing, from an earlier entry, is typed into as it is
async function reveal(run: Run, root: HTMLElement, entry: string, input: HTMLInputElement) {
  if (input.closest('fieldset')?.classList.contains('hidden')) await pickFromList(run, root, entry);
}

// A URL is read, not composed character by character, so typing it can move quicker
const URL_TYPE_MS = 60;

async function extractFrom(run: Run, root: HTMLElement, url: string) {
  const input = target<HTMLInputElement>(root, 'embed');
  await reveal(run, root, EXTRACT_FROM_URL, input);
  await run.type(input, url, URL_TYPE_MS);
  // A page can bring a dozen files through the proxy, and nothing after this means
  // anything until its faces are in
  await settle(run, input, 25000);
}

// A source's faces only join the dropdown, under its dot: leave the dot a moment to be
// seen, then choose the face from the list as a hand would
async function pickNewFamily(run: Run, root: HTMLElement, family: string) {
  const select = target<HTMLSelectElement>(root, 'family');
  await run.until(() => optionFor(select, family) !== undefined, 4000);
  await run.until(() => root.querySelector('.select-wrapper.new-dot') !== null, 1000);
  await run.wait(1400);
  const value = optionFor(select, family);
  if (value) await pickFromList(run, root, value);
  await run.wait(900);
}

/** Appears beyond the sheet's bottom edge; the scene's first glide brings it in from there */
export function entranceFor(root: HTMLElement): Scene {
  return async (run) => {
    const sheet = (root.closest('article.technical-drawing-stack > * > section') ?? root).getBoundingClientRect();
    run.appear({ x: sheet.right - sheet.width * 0.2, y: sheet.bottom + 80 });
    await run.wait(300);
  };
}

export function scenesFor(root: HTMLElement): Scene[] {
  return [
    // A page's own fonts first: that is the product's point, and the change is the largest
    async (run) => {
      await extractFrom(run, root, EMBED_URL);
      await pickNewFamily(run, root, EMBED_FAMILY);
    },

    async (run) => {
      await run.slide(target<HTMLInputElement>(root, 'size'), [1.25, 1], 1100);
      await run.wait(600);
    },

    async (run) => {
      const select = target<HTMLSelectElement>(root, 'family');
      const face = optionFor(select, 'Permanent Marker') ?? select.options[0].value;
      const hover = ['Poppins 700', 'Special Elite'].map((family) => optionFor(select, family)).filter((v): v is string => v !== undefined);
      await pickFromList(run, root, face, hover);
      await run.wait(900);
    },

    async (run) => {
      const input = target<HTMLInputElement>(root, 'google');
      await reveal(run, root, ADD_GOOGLE_FONT, input);
      await run.type(input, GOOGLE_FONT);
      await settle(run, input, 10000);
      await pickNewFamily(run, root, GOOGLE_FONT);
    },

    // The weight slider last, once a variable face is on: a single-weight face like
    // Permanent Marker would not move for it
    async (run) => {
      await extractFrom(run, root, VARIABLE_FONT_URL);
      await pickNewFamily(run, root, VARIABLE_FAMILY);
      await run.slide(target<HTMLInputElement>(root, 'weight'), [700, 300, 400]);
      await run.wait(600);
    },

    async (run) => {
      await run.click(target<HTMLButtonElement>(root, 'reset'));
      await run.clear(target<HTMLInputElement>(root, 'google'));
      await run.clear(target<HTMLInputElement>(root, 'embed'));
      await run.wait(1200);
    },
  ];
}
