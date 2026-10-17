import '../markers/client-only';

import { type MutableRefObject, useCallback, useLayoutEffect, useRef, useState } from 'react';

import { type SettledResizeObserver, settledResizeObserver } from '@/client/settledResize';

export function useRect<T extends Element | SVGElement>(
  ref_: MutableRefObject<T | null> | undefined = undefined,
  deps: unknown[] = [],
) {
  const ref = useRef<T | null>(ref_?.current ?? null);

  const [rect, setRect] = useState(() => ref.current?.getBoundingClientRect());
  const [refGeneration, setRefGeneration] = useState(0);

  const resize = useCallback(() => {
    const next = ref.current?.getBoundingClientRect();
    setRect((prev) => (
      prev && next
      && prev.x === next.x && prev.y === next.y
      && prev.width === next.width && prev.height === next.height
        ? prev
        : next
    ));
  }, []);
  const observer = useRef<SettledResizeObserver | undefined>(undefined);

  const measureRef = useCallback((el: T | null) => {
    ref.current = el;
    if (ref_) ref_.current = el;

    setRefGeneration((gen) => gen + 1);
    if (el !== null) resize();
  }, [ref_, resize]);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const resizeObserver = settledResizeObserver(resize);
    resizeObserver.observe(element);
    observer.current = resizeObserver;

    return () => {
      resizeObserver.disconnect();
      if (observer.current === resizeObserver) observer.current = undefined;
    };
  }, [resize, refGeneration]);

  // A change in deps measures again after the next layout, as a fresh observer's first
  // callback would, without building one: observing anew reports the current size.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || !observer.current) return;
    observer.current.unobserve(element);
    observer.current.observe(element);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { rect, measureRef };
}
