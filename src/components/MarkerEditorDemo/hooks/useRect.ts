import '../markers/client-only';

import { type MutableRefObject, useCallback, useLayoutEffect, useRef, useState } from 'react';

export function useRect<T extends Element | SVGElement>(
  ref_: MutableRefObject<T | null> | undefined = undefined,
  deps: unknown[] = [],
) {
  const ref = useRef<T | null>(ref_?.current ?? null);

  const [rect, setRect] = useState(ref.current?.getBoundingClientRect());
  const [refGeneration, setRefGeneration] = useState(0);

  const resize = useCallback(() => {
    setRect(ref.current?.getBoundingClientRect());
  }, []);

  const measureRef = useCallback((el: T | null) => {
    ref.current = el;
    if (ref_) ref_.current = el;

    setRefGeneration((gen) => gen + 1);
    if (el !== null) resize();
  }, [ref_, resize]);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    let resizeObserver: ResizeObserver | undefined = new ResizeObserver(() => resize());
    resizeObserver.observe(element);

    return () => {
      if (!resizeObserver) return;
      resizeObserver.disconnect();
      resizeObserver = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resize, refGeneration, ...deps]);

  return { rect, measureRef };
}
