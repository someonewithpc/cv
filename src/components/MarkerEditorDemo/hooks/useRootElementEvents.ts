import '../markers/client-only';

import { useEffect, useRef } from 'react';

export function useRootElementEvents<
  EventName extends keyof HTMLElementEventMap,
>(
  events: EventName[],
  callback: (e: HTMLElementEventMap[EventName]) => void,
) {
  const ref = useRef(callback);
  ref.current = callback;

  useEffect(() => {
    const handler = (e: Event) => ref.current(e as HTMLElementEventMap[EventName]);
    const target = document.documentElement;
    events.forEach((event) => target.addEventListener(event, handler));
    return () => events.forEach((event) => target.removeEventListener(event, handler));
  }, [events]);
}
