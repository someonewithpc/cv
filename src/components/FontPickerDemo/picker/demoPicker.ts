import { useSyncExternalStore } from 'react';

// A native select's list cannot be opened by script, so the auto-play draws one of its own
// under the select. FontFamily renders it from this state and previews whatever it hovers
type DemoPickerState = { open: boolean; hovered: number | null; previewable: boolean };

let state: DemoPickerState = { open: false, hovered: null, previewable: true };
const listeners = new Set<() => void>();

function set(next: DemoPickerState) {
  state = next;
  listeners.forEach((listener) => listener());
}

export const demoPicker = {
  // `previewable` is false when the run is only passing through the list on its way to a
  // subform entry: rows swept over getting there shouldn't flash their face onto the specimen
  open: (previewable = true) => set({ open: true, hovered: null, previewable }),
  hover: (index: number) => set({ ...state, hovered: index }),
  close: () => set({ open: false, hovered: null, previewable: true }),
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
