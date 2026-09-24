import { watchPageActive } from '@/client/frontPage';

import { registerFontSettingsProperties } from '../picker/registerFontSettingsProperties';

const BORDER_ANIMATION_DURATION = 1000;

type State = 'idle' | 'pending' | 'success' | 'error';

// A request that succeeds, then one that fails, with a beat on each verdict to read it
const WALKTHROUGH: { state: State; hold: number }[] = [
  { state: 'idle', hold: 900 },
  { state: 'pending', hold: 2600 },
  { state: 'success', hold: 2200 },
  { state: 'idle', hold: 900 },
  { state: 'pending', hold: 1800 },
  { state: 'error', hold: 2200 },
];

/**
 * Wires the sheet's sample fieldset to its four state buttons, registers the border's custom
 * properties, without which the conic gradient cannot animate, and plays the request the
 * border reports on while this page is the one in front. A press on any button is the visitor
 * taking it over, and it stays theirs.
 */
export function boot(host: HTMLElement) {
  registerFontSettingsProperties();

  const fieldset = host.querySelector<HTMLElement>('[data-border-demo]');
  if (!fieldset) return;

  // Same trick as the live subform: the pending loop eases in, then goes linear at the
  // point where the bezier is already essentially linear
  fieldset.addEventListener('animationstart', () => {
    setTimeout(() => {
      fieldset.style.setProperty('animation-timing-function', 'linear');
    }, BORDER_ANIMATION_DURATION * 0.75);
  });
  fieldset.addEventListener('animationend', () => {
    fieldset.style.removeProperty('animation-timing-function');
  });

  const buttons = [...host.querySelectorAll<HTMLButtonElement>('[data-border-state]')];

  const show = (state: State) => {
    fieldset.classList.remove('idle', 'pending', 'success', 'error');
    fieldset.classList.add(state);
    buttons.forEach((button) => {
      const active = button.dataset.borderState === state;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  };

  let userControl = false;
  let timer = 0;
  let step = 0;

  const run = () => {
    const { state, hold } = WALKTHROUGH[step];
    show(state);
    step = (step + 1) % WALKTHROUGH.length;
    timer = window.setTimeout(run, hold);
  };

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      userControl = true;
      window.clearTimeout(timer);
      show(button.dataset.borderState as State);
    });
  });

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // Every page of the stack shares one grid cell, so intersection alone would keep this
  // running behind whichever page the visitor turned to. Nothing ever unmounts an island,
  // so the watcher's stop function has no caller and is not returned.
  watchPageActive(host, (active) => {
    window.clearTimeout(timer);
    if (active && !userControl) run();
  });
}
