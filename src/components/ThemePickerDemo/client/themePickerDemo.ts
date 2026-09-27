import { THEME_STORAGE_KEY } from '@/themes';

/**
 * The sheet's keys press the picker in the corner. A pick key checks that theme's radio and
 * sends the input event the picker listens for, so the wipe, the stamp and the stored pick
 * all happen in the picker's own code. The forget key is the sheet's own: it clears what a
 * pick wrote, so the OS colour scheme decides again, with no wipe.
 */
export function initThemePickerDemo(host: HTMLElement) {
  const radios = [...document.querySelectorAll<HTMLInputElement>('#theme-picker input')];
  const keys = [...host.querySelectorAll<HTMLButtonElement>('[data-pick]')];
  const forget = host.querySelector<HTMLButtonElement>('[data-forget]');
  const osDark = window.matchMedia('(prefers-color-scheme: dark)');

  /* The theme on screen, read from what the picker wrote rather than from computed style:
     the stamp when there is one, the OS scheme otherwise. */
  const shown = () => document.documentElement.dataset.theme ?? (osDark.matches ? 'dark' : 'light');

  const press = () => {
    const current = shown();
    keys.forEach((key) => key.setAttribute('aria-pressed', String(key.dataset.pick === current)));
  };

  keys.forEach((key) => {
    key.addEventListener('click', () => {
      const radio = radios.find((input) => input.value === key.dataset.pick);
      if (!radio) return;
      radio.checked = true;
      radio.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });

  forget?.addEventListener('click', () => {
    try {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    document.documentElement.removeAttribute('data-theme');
    radios.forEach((radio) => {
      radio.checked = false;
      radio.classList.remove('checked');
    });
  });

  /* The stamp changes on a pick from anywhere, the corner included; the OS scheme can change
     under a page nobody picked on. Both are attribute or media events, no style is read. */
  new MutationObserver(press).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  osDark.addEventListener('change', press);
  press();
}
