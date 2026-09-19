import { scrollToStyle } from './panel';
import { BANQUET_CARD, CHAIR_CARD } from './variantsCatalog';

export type AutoplayStep = {
  /** CSS selector, resolved inside the demo root each time the step runs. */
  aim: string;
  /** Where on the target the cursor lands, as fractions of its box; the centre by default. */
  at?: { x: number; y: number };
  /** Wait before the step's own action, in ms. */
  delay: number;
  /** `next` scrolls the carousel one style on, where the arrow is a CSS scroll button. */
  act?: 'click' | 'hover' | 'next';
};

const CHAIR = `[data-catalog-item="${CHAIR_CARD.id}"]`;
const SET = `[data-catalog-item="${BANQUET_CARD.id}"]`;
const NEXT_ARROW = { x: 0.92, y: 0.5 };

/**
 * One loop of the demo: step the chair through its finishes, then take the banquet set
 * through its seat count and its table size, ending on a pair the library does not carry.
 * Every step is a control a visitor can work itself.
 */
export const AUTOPLAY_STEPS: AutoplayStep[] = [
  { aim: `${CHAIR} .object-icons`, delay: 1400 },
  { aim: `${CHAIR} ul.styles`, at: NEXT_ARROW, delay: 700, act: 'next' },
  { aim: `${CHAIR} ul.styles`, at: NEXT_ARROW, delay: 2200, act: 'next' },
  { aim: `${CHAIR} ul.styles`, at: NEXT_ARROW, delay: 2200, act: 'next' },

  { aim: `${SET} .object-pax .hover-select-current`, delay: 2000, act: 'click' },
  { aim: `${SET} .object-pax li:nth-child(2) button`, delay: 900, act: 'hover' },
  { aim: `${SET} .object-pax li:nth-child(2) button`, delay: 1200, act: 'click' },

  { aim: `${SET} .object-size .hover-select-current`, delay: 2200, act: 'click' },
  { aim: `${SET} .object-size li:nth-child(2) button`, delay: 900, act: 'hover' },
  { aim: `${SET} .object-size li:nth-child(2) button`, delay: 900, act: 'click' },

  { aim: `${SET} .object-pax .hover-select-current`, delay: 2200, act: 'click' },
  { aim: `${SET} .object-pax li:nth-child(1) button`, delay: 900, act: 'hover' },
  { aim: `${SET} .object-pax li:nth-child(1) button`, delay: 900, act: 'click' },
  // The fourth finish is the one on show after three steps; clicking it picks the chair
  // again, so the highlight is seen moving back.
  { aim: `${CHAIR} .style:nth-child(4) img`, delay: 2600, act: 'click' },
  { aim: `${CHAIR} .style:nth-child(4) img`, delay: 1800 },
];

const CURSOR_TRAVEL_MS = 560;
const CURSOR_CLICK_MS = 260;
const CURSOR_FADE_MS = 420;
const RESUME_DELAY_MS = 6000;

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function runStep(el: HTMLElement, act: AutoplayStep['act']) {
  if (act === 'click') el.click();
  if (act === 'hover') el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  if (act === 'next') scrollToStyle(el, Number(el.dataset.index ?? 0) + 1);
}

/**
 * The demo's own hand: a drawn cursor that works the cards through AUTOPLAY_STEPS. A
 * trusted pointer or focus inside the host hands the cards over to the visitor; the loop
 * resumes after a quiet spell.
 */
export function createPlayer(host: HTMLElement) {
  const cursor = document.createElement('span');
  cursor.className = 'demo-cursor';
  cursor.setAttribute('aria-hidden', 'true');
  cursor.hidden = true;
  host.append(cursor);

  let playToken = 0;
  let active = false;
  let userControl = false;
  let moved = false;
  let noteOpen = false;
  let resumeTimer: ReturnType<typeof setTimeout> | null = null;
  let fadeTimer: ReturnType<typeof setTimeout> | null = null;
  let clickTimer: ReturnType<typeof setTimeout> | null = null;

  const setUserControl = (value: boolean) => {
    userControl = value;
    host.dataset.userControl = value ? 'true' : 'false';
  };
  setUserControl(false);

  function showCursor() {
    if (fadeTimer) clearTimeout(fadeTimer);
    cursor.hidden = false;
    cursor.classList.remove('demo-cursor--fading');
  }

  function hideCursor(fade: boolean) {
    if (fadeTimer) clearTimeout(fadeTimer);
    if (!fade || cursor.hidden) {
      cursor.hidden = true;
      return;
    }
    cursor.classList.add('demo-cursor--fading');
    fadeTimer = setTimeout(() => {
      cursor.hidden = true;
      cursor.classList.remove('demo-cursor--fading');
    }, CURSOR_FADE_MS);
  }

  /** Move the cursor onto `el`; true when it had some way to go. */
  function aimCursor(el: HTMLElement, at = { x: 0.5, y: 0.5 }) {
    const rect = el.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    const x = rect.left + rect.width * at.x - hostRect.left;
    const y = rect.top + rect.height * at.y - hostRect.top;
    const from = { x: parseFloat(cursor.style.left) || 0, y: parseFloat(cursor.style.top) || 0 };
    const travels = !moved || Math.hypot(x - from.x, y - from.y) > 8;
    moved = true;
    cursor.style.left = `${x}px`;
    cursor.style.top = `${y}px`;
    showCursor();
    return travels;
  }

  function flashClick() {
    cursor.classList.add('demo-cursor--clicking');
    if (clickTimer) clearTimeout(clickTimer);
    clickTimer = setTimeout(() => cursor.classList.remove('demo-cursor--clicking'), CURSOR_CLICK_MS);
  }

  function wait(ms: number, token: number) {
    return new Promise<void>((resolve) => {
      setTimeout(() => resolve(), token === playToken ? ms : 0);
    });
  }

  function resetCards() {
    host.querySelectorAll<HTMLElement>('ul.styles').forEach((styles) => scrollToStyle(styles, 0));
    host.dispatchEvent(new CustomEvent('variants:reset'));
  }

  async function play() {
    const token = ++playToken;
    showCursor();
    for (let index = 0; token === playToken; index += 1) {
      const step = AUTOPLAY_STEPS[index % AUTOPLAY_STEPS.length];
      if (index > 0 && index % AUTOPLAY_STEPS.length === 0) resetCards();
      await wait(step.delay, token);
      if (token !== playToken) return;

      const el = host.querySelector<HTMLElement>(step.aim);
      if (!el) continue;
      if (aimCursor(el, step.at)) await wait(CURSOR_TRAVEL_MS, token);
      if (token !== playToken) return;
      if (step.act === 'click' || step.act === 'next') flashClick();
      runStep(el, step.act);
    }
  }

  function stopPlaying() {
    playToken += 1;
  }

  function canPlay() {
    return active && !noteOpen && !userControl && !reducedMotion();
  }

  function restartIdleTimer() {
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => {
      resumeTimer = null;
      if (!active || noteOpen || reducedMotion()) return;
      setUserControl(false);
      void play();
    }, RESUME_DELAY_MS);
  }

  function yieldToUser() {
    if (userControl) {
      restartIdleTimer();
      return;
    }
    setUserControl(true);
    stopPlaying();
    hideCursor(true);
    restartIdleTimer();
  }

  function onTrustedPointer(event: Event) {
    if (!event.isTrusted || !active) return;
    const target = event.target;
    if (!(target instanceof Node) || !host.contains(target)) return;
    yieldToUser();
  }

  host.addEventListener('focus', yieldToUser);
  window.addEventListener('pointerdown', onTrustedPointer);
  window.addEventListener('pointermove', onTrustedPointer);

  return {
    setActive(value: boolean) {
      active = value;
      if (!value) {
        stopPlaying();
        hideCursor(false);
        return;
      }
      if (canPlay()) void play();
    },
    setNoteOpen(value: boolean) {
      noteOpen = value;
      if (value) {
        stopPlaying();
        return;
      }
      if (canPlay()) void play();
    },
    dispose() {
      stopPlaying();
      if (resumeTimer) clearTimeout(resumeTimer);
      if (fadeTimer) clearTimeout(fadeTimer);
      if (clickTimer) clearTimeout(clickTimer);
      host.removeEventListener('focus', yieldToUser);
      window.removeEventListener('pointerdown', onTrustedPointer);
      window.removeEventListener('pointermove', onTrustedPointer);
      cursor.remove();
    },
  };
}
