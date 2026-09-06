import { type ReactNode, useState } from 'react';

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

  return { raw, setRaw, status: value === '' ? 'idle' : status };
}

/** The fieldset whose border reports on the fetch its input triggers */
export function SubForm({ status, children }: { status: string, children: ReactNode }) {
  return (
    <fieldset
      className={status}
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
