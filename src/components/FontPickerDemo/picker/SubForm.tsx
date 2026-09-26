import { type ReactNode, useEffect, useMemo, useState } from 'react';
import cx from 'classnames';

import { useDebounce } from './useDebounce';
import { useFontQuery } from './useFontQuery';

const STATUS_BORDER_DURATION = 1000; // Must match $status-border-duration

// `onLoaded` fires for the query's result, cached ones included, so entering a URL again
// after a reset puts its faces back on
export function useSubFormInput<T>(name: string, load: (value: string, signal: AbortSignal) => Promise<T>, onLoaded: (result: T) => void) {
  const [raw, setRaw] = useState('');
  // The string is what gets debounced, and the key is built from it once per value: a fresh
  // array handed to useDebounce every render differed by reference each time, so its effect
  // re-armed after every commit and re-rendered the subform every 250ms for good.
  const value = useDebounce(raw.trim(), 250);
  const queryKey = useMemo(() => [name, value], [name, value]);

  const { status, data } = useFontQuery({
    queryKey,
    queryFn: ({ signal }) => value === '' ? Promise.resolve(undefined) : load(value, signal),
  });

  useEffect(() => {
    if (data !== undefined) onLoaded(data);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const notEmpty = raw.trim() !== '';
  return { raw, setRaw, notEmpty, status: notEmpty ? status : 'idle' };
}

/**
 * The fieldset whose border reports on the fetch its input triggers. Like the product's,
 * it only shows once picked from the dropdown, and then stays while it has text or focus
 */
export function SubForm(
  { visible, notEmpty, status, children }:
  { visible: boolean, notEmpty: boolean, status: string, children: ReactNode }
) {
  const [hasFocus, setHasFocus] = useState(false);

  return (
    <fieldset
      className={cx({ hidden: !(visible || notEmpty || hasFocus) }, status)}
      onFocus={() => setHasFocus(true)}
      onBlur={() => setHasFocus(false)}
      onAnimationStart={(e) => {
        // The pending loop eases in, then goes linear at the point where the bezier
        // already is, so the orbit has no seam. currentTarget changes once the event has
        // bubbled, so capture it first
        const target = e.currentTarget;
        setTimeout(() => {
          target.style.setProperty('animation-timing-function', 'linear');
        }, STATUS_BORDER_DURATION * 0.75);
      }}
      onAnimationEnd={(e) => {
        e.currentTarget.style.removeProperty('animation-timing-function');
      }}
    >
      {children}
    </fieldset>
  );
}
