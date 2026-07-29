import { useLayoutEffect, useSyncExternalStore } from 'react';

/**
 * Marker parts / imperative SVG hosts are process-wide singletons — only one
 * MarkerEditor may mount at a time. Live (map) sessions register here so the
 * diagram embed can wait until they actually unmount before claiming them.
 */
let liveSessions = 0;
const listeners = new Set<() => void>();

const subscribe = (onStoreChange: () => void) => {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
};

const getLiveSessionCount = () => liveSessions;

const emit = () => {
  listeners.forEach((listener) => listener());
};

export function useLiveMarkerEditorSession(active: boolean) {
  useLayoutEffect(() => {
    if (!active) return;

    liveSessions += 1;
    emit();
    return () => {
      liveSessions -= 1;
      emit();
    };
  }, [active]);
}

export function useLiveMarkerEditorSessionCount() {
  return useSyncExternalStore(subscribe, getLiveSessionCount, () => 0);
}
