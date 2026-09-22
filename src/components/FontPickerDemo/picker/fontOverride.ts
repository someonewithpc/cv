import { useSyncExternalStore } from 'react';

export type FontOverride = {
  family: string | null;
  style: string;
  size: number;
  weight: number | null;
};

// What the demo wears with nothing chosen: the product's own face
export const DEFAULT_FAMILY = 'Poppins';

export const NO_OVERRIDE: FontOverride = { family: null, style: 'normal', size: 1, weight: null };

type State = {
  committed: FontOverride;
  shown: FontOverride;
  externalFaces: Record<string, string>;
};

let state: State = { committed: NO_OVERRIDE, shown: NO_OVERRIDE, externalFaces: {} };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function styleElement() {
  let el = document.head.querySelector<HTMLStyleElement>('style[data-font-tools]');
  if (!el) {
    el = document.createElement('style');
    el.dataset.fontTools = '';
    document.head.append(el);
  }
  return el;
}

// The demo alone wears the settings, sidebar and specimen both, the way everything under
// the product's wrapper does. The face is set on the root and inherited, not forced: what
// declares a face of its own keeps it, which is the dropdown's rows and the family label
// with the committed face, and the monospace readout
const ROOT = '[data-font-picker-island] .edit-style';
// The size goes on the two columns, not the grid: its tracks are in em too, and scaling them
// with the type would squeeze the specimen for the sidebar's sake
const SIZED = `${ROOT} > *`;

function render({ family, style, size, weight }: FontOverride, externalFaces: Record<string, string>) {
  const rules: string[] = [];

  if (size !== 1) rules.push(`${SIZED} { font-size: ${size}em; }`);

  if (family !== null) {
    if (externalFaces[family]) rules.push(externalFaces[family]);
    rules.push(`${ROOT} {
  font-family: '${family}', sans-serif;${style !== 'normal' ? `\n  font-style: ${style};` : ''}
}`);
  }

  if (weight !== null) {
    rules.push(`${ROOT} { font-weight: ${weight}; }
${ROOT} :is(b, strong) { font-weight: ${Math.min(1000, Math.round((weight * 7 / 4) / 50) * 50)}; }`);
  }

  return rules.join('\n\n');
}

function show(override: FontOverride) {
  state = { ...state, shown: override };
  styleElement().textContent = render(override, state.externalFaces);
  emit();
}

export function commitOverride(patch: Partial<FontOverride>) {
  const next = { ...state.committed, ...patch };
  state = { ...state, committed: next };
  show(next);
}

export function previewOverride(patch: Partial<FontOverride>) {
  show({ ...state.committed, ...patch });
}

export function endPreview() {
  show(state.committed);
}

export function resetOverride() {
  state = { ...state, committed: NO_OVERRIDE };
  show(NO_OVERRIDE);
}

export function registerExternalFaces(map: Record<string, string>) {
  state = { ...state, externalFaces: { ...state.externalFaces, ...map } };
  emit();
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

export function useFontOverride(): State {
  return useSyncExternalStore(subscribe, () => state, () => state);
}
