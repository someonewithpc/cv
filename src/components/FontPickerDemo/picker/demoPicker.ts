import { useSyncExternalStore } from 'react';

// A native select's list cannot be opened by script, so the auto-play draws one of its own
// under the select. FontFamily renders it from this state and previews whatever it hovers
type DemoPickerState = { open: boolean; hovered: number | null };

let state: DemoPickerState = { open: false, hovered: null };
const listeners = new Set<() => void>();

function set(next: DemoPickerState) {
  state = next;
  listeners.forEach((listener) => listener());
}

export const demoPicker = {
  open: () => set({ open: true, hovered: null }),
  hover: (index: number) => set({ ...state, hovered: index }),
  close: () => set({ open: false, hovered: null }),
};

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

export function useDemoPicker() {
  return useSyncExternalStore(subscribe, () => state, () => state);
}
