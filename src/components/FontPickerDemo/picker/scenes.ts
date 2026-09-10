import { ADD_GOOGLE_FONT, EXTRACT_FROM_URL } from './FontFamily';
import { demoPicker } from './demoPicker';
import { type Run, type Scene, setNativeValue } from './playthrough';

const GOOGLE_FONT = 'Lobster';
// A page without web fonts first, for the red ring, then one whose faces load
const EMBED_URLS = ['news.ycombinator.com', 'astro.build'];

const target = <T extends HTMLElement>(root: HTMLElement, name: string) => {
  const el = root.querySelector<T>(`[data-demo-target="${name}"]`);
  if (!el) throw new Error(`no demo target ${name}`);
  return el;
};

const verdict = (input: HTMLInputElement) => {
  const fieldset = input.closest('fieldset');
  return () => fieldset !== null && /\b(success|error)\b/.test(fieldset.className);
};

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

  for (const hovered of [...hoverFirst, value]) {
    const index = values.indexOf(hovered);
    if (index < 0) continue;
    await run.moveTo(items()[index]);
    await run.wait(hovered === value ? 500 : 1300);
  }

  const index = values.indexOf(value);
  if (index >= 0) {
    await run.press(items()[index]);
    setNativeValue(select, value);
  }
  run.leave();
  demoPicker.close();
  await run.wait(600);
}

export function scenesFor(root: HTMLElement): Scene[] {
  return [
    // Faces first: Poppins ships four, which leaves the weight slider disabled until a
    // single-face family is on
    async (run) => {
      const select = target<HTMLSelectElement>(root, 'family');
      const face = optionFor(select, 'Permanent Marker') ?? select.options[0].value;
      const hover = ['Poppins 700', 'Special Elite'].map((family) => optionFor(select, family)).filter((v): v is string => v !== undefined);
      await pickFromList(run, root, face, hover);
      await run.wait(900);
    },

    async (run) => {
      await run.slide(target<HTMLInputElement>(root, 'weight'), [700, 300, 400]);
      await run.wait(600);
    },

    async (run) => {
      await run.slide(target<HTMLInputElement>(root, 'size'), [1.25, 1], 1100);
      await run.wait(600);
    },

    async (run) => {
      await pickFromList(run, root, ADD_GOOGLE_FONT);
      const input = target<HTMLInputElement>(root, 'google');
      await run.type(input, GOOGLE_FONT);
      await run.until(verdict(input), 10000);
      await run.wait(2200);
    },

    async (run) => {
      await pickFromList(run, root, EXTRACT_FROM_URL);
      const input = target<HTMLInputElement>(root, 'embed');
      for (const url of EMBED_URLS) {
        await run.type(input, url);
        await run.until(verdict(input), 12000);
        await run.wait(2200);
      }
    },

    async (run) => {
      await run.click(target<HTMLButtonElement>(root, 'reset'));
      await run.clear(target<HTMLInputElement>(root, 'google'));
      await run.clear(target<HTMLInputElement>(root, 'embed'));
      await run.wait(1200);
    },
  ];
}
