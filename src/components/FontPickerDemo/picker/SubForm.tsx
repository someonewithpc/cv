import { type ReactNode, useState } from 'react';
import cx from 'classnames';

import { useDebounce } from './useDebounce';
import { useFontQuery } from './useFontQuery';
import { registerFontSettingsProperties } from './registerFontSettingsProperties';

const STATUS_BORDER_DURATION = 1000; // Must match $status-border-duration

registerFontSettingsProperties();

export function useSubFormInput(name: string, load: (value: string, signal: AbortSignal) => Promise<unknown>) {
  const [raw, setRaw] = useState('');
  const queryKey = useDebounce([name, raw.trim()], 250);
  const value = queryKey[1];

  const { status } = useFontQuery({
    queryKey,
    queryFn: ({ signal }) => value === '' ? Promise.resolve(null) : load(value, signal),
  });

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
