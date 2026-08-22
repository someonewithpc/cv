import { useEffect, useSyncExternalStore } from 'react';

export type QueryStatus = 'pending' | 'success' | 'error';

export type QueryOptions = {
  queryKey: unknown[];
  queryFn: (context: { signal: AbortSignal }) => Promise<unknown>;
  enabled?: boolean;
};

type Entry = { status: QueryStatus };

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();

function setEntry(key: string, entry: Entry) {
  entries.set(key, entry);
  listeners.forEach((listener) => listener());
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

/**
 * The little slice of @tanstack/react-query the picker actually uses: a status shared
 * across every component holding the same (already debounced) key, fetched once by
 * whichever subscriber has `enabled` set, and aborted when the key changes under it.
 */
export function useFontQuery({ queryKey, queryFn, enabled = true }: QueryOptions) {
  const key = JSON.stringify(queryKey);

  useEffect(() => {
    if (!enabled) return;
    if (entries.get(key)?.status === 'success') return;

    const controller = new AbortController();
    setEntry(key, { status: 'pending' });

    queryFn({ signal: controller.signal })
      .then(() => setEntry(key, { status: 'success' }))
      .catch(() => {
        if (!controller.signal.aborted) setEntry(key, { status: 'error' });
      });

    return () => {
      controller.abort();
    };
  }, [key, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const status = useSyncExternalStore(
    subscribe,
    () => entries.get(key)?.status ?? 'pending',
    (): QueryStatus => 'pending',
  );

  return { status };
}
