import { useEffect, useSyncExternalStore } from 'react';

export type QueryStatus = 'pending' | 'success' | 'error';

export type QueryOptions<T> = {
  queryKey: unknown[];
  queryFn: (context: { signal: AbortSignal }) => Promise<T>;
  enabled?: boolean;
};

type Entry<T> = { status: QueryStatus, data?: T };

// Every debounced value typed is a key, so only the most recent ones are kept
const MAX_ENTRIES = 64;
const entries = new Map<string, Entry<unknown>>();
const listeners = new Set<() => void>();

function setEntry(key: string, entry: Entry<unknown>) {
  entries.delete(key);
  entries.set(key, entry);
  if (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!);
  listeners.forEach((listener) => listener());
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

/**
 * The little slice of @tanstack/react-query the picker actually uses: a status and result
 * shared across every component holding the same (already debounced) key, fetched once by
 * whichever subscriber has `enabled` set, and aborted when the key changes under it.
 */
export function useFontQuery<T>({ queryKey, queryFn, enabled = true }: QueryOptions<T>) {
  const key = JSON.stringify(queryKey);

  useEffect(() => {
    if (!enabled) return;
    if (entries.get(key)?.status === 'success') return;

    const controller = new AbortController();
    setEntry(key, { status: 'pending' });

    queryFn({ signal: controller.signal })
      .then((data) => setEntry(key, { status: 'success', data }))
      .catch(() => {
        if (!controller.signal.aborted) setEntry(key, { status: 'error' });
      });

    return () => {
      controller.abort();
    };
  }, [key, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const entry = useSyncExternalStore(
    subscribe,
    () => entries.get(key),
    () => undefined,
  );

  return { status: entry?.status ?? 'pending', data: entry?.data as T | undefined };
}
