import { useSyncExternalStore } from 'react';

import { cssString } from './cssString';

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

// The settings go on the demo's root as properties that EditStyle.scss reads, never into a
// stylesheet: Safari restyles the whole page each time a sheet's text changes, about 480 ms at
// 1440 px, and the walkthrough changed it on every step. A face from a subform needs no sheet
// either, since loading it already added it to document.fonts
export type OverrideStyle = Record<`--font-tools-${string}`, string>;

/** The root's attributes and properties for an override; an unset field has neither */
export function overrideStyle({ family, style, size, weight }: FontOverride): {
  attributes: Record<string, ''>;
  style: OverrideStyle;
} {
  const attributes: Record<string, ''> = {};
  const props: OverrideStyle = {};

  if (size !== 1) {
    attributes['data-font-size'] = '';
    props['--font-tools-size'] = String(size);
  }
  if (family !== null) {
    attributes['data-font-family'] = '';
    props['--font-tools-family'] = cssString(family);
    if (style !== 'normal') {
      attributes['data-font-style'] = '';
      props['--font-tools-style'] = style;
    }
  }
  if (weight !== null) {
    attributes['data-font-weight'] = '';
    props['--font-tools-weight'] = String(weight);
    props['--font-tools-bold'] = String(Math.min(1000, Math.round((weight * 7 / 4) / 50) * 50));
  }

  return { attributes, style: props };
}

function show(override: FontOverride) {
  state = { ...state, shown: override };
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
