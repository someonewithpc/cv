import { registerFontSettingsProperties } from '../picker/registerFontSettingsProperties';

const BORDER_ANIMATION_DURATION = 1000;

// Wires the sheet's sample fieldset to its four state buttons, and registers the border's
// custom properties, without which the conic gradient cannot animate
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

  const buttons = host.querySelectorAll<HTMLButtonElement>('[data-border-state]');
  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      fieldset.classList.remove('idle', 'pending', 'success', 'error');
      fieldset.classList.add(button.dataset.borderState!);
      buttons.forEach((b) => b.classList.toggle('active', b === button));
    });
  });
}
