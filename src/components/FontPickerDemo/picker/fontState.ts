import { useSyncExternalStore } from 'react';

export type FontState = {
  cssText: string;
  externalFontFaceDeclarations: Record<string, string>;
};

let state: FontState = { cssText: '', externalFontFaceDeclarations: {} };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function styleElement() {
  let el = document.head.querySelector<HTMLStyleElement>('style[data-font-picker-demo]');
  if (!el) {
    el = document.createElement('style');
    el.dataset.fontPickerDemo = '';
    document.head.append(el);
  }
  return el;
}

export function setCustomCss(cssText: string) {
  state = { ...state, cssText };
  styleElement().textContent = cssText;
  emit();
}

export function registerExternalFontFaceDeclarations(map: Record<string, string>) {
  state = {
    ...state,
    externalFontFaceDeclarations: { ...state.externalFontFaceDeclarations, ...map },
  };
  emit();
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

export function useFontState(): FontState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}
