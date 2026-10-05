import type { KeyboardEvent } from 'react';

/**
 * Keys for the editor's option lists, which are one Tab stop each: the selected option holds
 * tabindex 0 and the rest -1. The arrows, Home and End move to another option and click it,
 * so selection follows focus as in a native select. Enter and Space click the focused one.
 * An option marked aria-disabled is passed over.
 */
export function onOptionKey(event: KeyboardEvent<HTMLElement>) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const current = event.currentTarget;
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    if (!event.repeat) current.click();
    return;
  }
  const options = [...(current.parentElement?.children ?? [])].filter(
    (option): option is HTMLElement => option instanceof HTMLElement
      && option.getAttribute('role') === 'option'
      && option.getAttribute('aria-disabled') !== 'true',
  );
  const at = options.indexOf(current);
  if (at < 0) return;
  const next = {
    ArrowLeft: options[at - 1],
    ArrowUp: options[at - 1],
    ArrowRight: options[at + 1],
    ArrowDown: options[at + 1],
    Home: options[0],
    End: options[options.length - 1],
  }[event.key];
  if (!next || next === current) return;
  event.preventDefault();
  next.focus();
  next.click();
}
