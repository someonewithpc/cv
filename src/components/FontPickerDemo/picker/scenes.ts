import { ADD_GOOGLE_FONT, EXTRACT_FROM_URL } from './FontFamily';
import { demoPicker } from './demoPicker';
import { type Run, type Scene, setNativeValue } from './playthrough';

const GOOGLE_FONT = 'Lobster';
// A well-known page without web fonts first, for the red ring, then one whose face could not
// look less like Poppins
const EMBED_URLS = ['news.ycombinator.com', 'rust-lang.org'];
// The weight slider only tells on a variable face, and this page has one
const VARIABLE_FONT_URL = 'astro.build';

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

  await run.press(select);
  demoPicker.open();
  await run.wait(400);

  // A row out of the list's scroll is wheeled into view first, as a hand would
  const row = (index: number) => {
    const item = items()[index];
    item.scrollIntoView({ block: 'nearest' });
    return item;
  };

  for (const hovered of [...hoverFirst, value]) {
    const index = values.indexOf(hovered);
    if (index < 0) continue;
    await run.moveTo(row(index));
    await run.wait(hovered === value ? 500 : 1300);
  }

  const index = values.indexOf(value);
  if (index >= 0) {
    await run.press(row(index));
    setNativeValue(select, value);
  }
  run.leave();
  demoPicker.close();
  await run.wait(600);
}

async function extractFrom(run: Run, root: HTMLElement, url: string) {
  const input = target<HTMLInputElement>(root, 'embed');
  await run.type(input, url);
  // A page can bring a dozen files through the proxy, and the sliders mean nothing until
  // its face is on
  await settle(run, input, 25000);
  await run.wait(2200);
}

export function scenesFor(root: HTMLElement): Scene[] {
  return [
    // A page's own fonts first: that is the product's point, and the change is the largest
    async (run) => {
      await pickFromList(run, root, EXTRACT_FROM_URL);
      for (const url of EMBED_URLS) await extractFrom(run, root, url);
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
      await pickFromList(run, root, ADD_GOOGLE_FONT);
      const input = target<HTMLInputElement>(root, 'google');
      await run.type(input, GOOGLE_FONT);
      await settle(run, input, 10000);
      await run.wait(2200);
    },

    // The weight slider last, once a variable face is on: a single-weight face like
    // Permanent Marker would not move for it
    async (run) => {
      await pickFromList(run, root, EXTRACT_FROM_URL);
      await extractFrom(run, root, VARIABLE_FONT_URL);
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
