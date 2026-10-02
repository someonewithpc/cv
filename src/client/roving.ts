/**
 * One Tab stop for a set of controls (a roving tabindex). The control last focused keeps
 * tabindex 0 and the rest take -1, so Tab enters the set where the visitor left it and the
 * next Tab leaves it. `step` picks where an arrow key goes; returning null leaves the key
 * to the browser. Without script every control stays a Tab stop of its own.
 */
export function rove(
  container: HTMLElement,
  items: HTMLElement[],
  step: (event: KeyboardEvent, current: HTMLElement) => HTMLElement | null | undefined,
) {
  if (items.length < 2) return;

  const hold = (stop: HTMLElement) => items.forEach((item) => (item.tabIndex = item === stop ? 0 : -1));
  hold(items[0]);

  container.addEventListener('focusin', (event) => {
    if (items.includes(event.target as HTMLElement)) hold(event.target as HTMLElement);
  });

  container.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const current = event.target as HTMLElement;
    if (!items.includes(current)) return;
    const next = step(event, current);
    if (!next || next === current) return;
    event.preventDefault();
    next.focus();
  });
}

/** Points `controls` at a hidden line that names the keys, read out as their description. */
export function describeKeys(container: HTMLElement, controls: HTMLElement[], id: string, text: string) {
  const hint = document.createElement('span');
  hint.id = id;
  hint.hidden = true;
  hint.textContent = text;
  container.append(hint);
  controls.forEach((control) => {
    const ids = control.getAttribute('aria-describedby');
    control.setAttribute('aria-describedby', ids ? `${ids} ${id}` : id);
  });
}
