import { onAutoplayCommand, reducedMotion, reportAutoplayState, type AutoplayState } from '@/client/autoplayStatus';
import { createCursorMover, type Point } from '@/client/cursorMotion';
import type { DemoGate } from '@/client/frontPage';
import { watchHandover } from '@/client/walkthroughHandover';

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

  // The pointer walks down the open list and back up, so the card is seen showing each
  // row it passes before the click picks one.
  { aim: `${SET} .object-pax .hover-select-current`, delay: 2000, act: 'click' },
  { aim: `${SET} .object-pax li:nth-child(1) button`, delay: 700, act: 'hover' },
  { aim: `${SET} .object-pax li:nth-child(2) button`, delay: 900, act: 'hover' },
  { aim: `${SET} .object-pax li:nth-child(3) button`, delay: 900, act: 'hover' },
  { aim: `${SET} .object-pax li:nth-child(2) button`, delay: 1000, act: 'hover' },
  { aim: `${SET} .object-pax li:nth-child(2) button`, delay: 1000, act: 'click' },

  { aim: `${SET} .object-size .hover-select-current`, delay: 2200, act: 'click' },
  { aim: `${SET} .object-size li:nth-child(1) button`, delay: 700, act: 'hover' },
  { aim: `${SET} .object-size li:nth-child(2) button`, delay: 900, act: 'hover' },
  { aim: `${SET} .object-size li:nth-child(2) button`, delay: 1000, act: 'click' },

  { aim: `${SET} .object-pax .hover-select-current`, delay: 2200, act: 'click' },
  { aim: `${SET} .object-pax li:nth-child(3) button`, delay: 700, act: 'hover' },
  { aim: `${SET} .object-pax li:nth-child(1) button`, delay: 900, act: 'hover' },
  { aim: `${SET} .object-pax li:nth-child(1) button`, delay: 1000, act: 'click' },

  // No eight-seat small table: the size moved back on its own and carries the red dot.
  // Opening the size row reads it, and the dot goes.
  { aim: `${SET} .object-size .hover-select-current`, delay: 2600, act: 'click' },
  { aim: `${SET} .object-size .hover-select-current`, delay: 1400, act: 'click' },
  // The fourth finish is the one on show after three steps; clicking it picks the chair
  // again, so the highlight is seen moving back.
  { aim: `${CHAIR} .style:nth-child(4) img`, delay: 2600, act: 'click' },
  { aim: `${CHAIR} .style:nth-child(4) img`, delay: 1800 },
];

/** The tip of the drawn arrow, as fractions of the cursor's box. */
const CURSOR_HOTSPOT = { x: 0.12, y: 0.08 };
/** A hand rests a moment on the target before it presses. */
const PRESS_DELAY_MS = 160;
const CURSOR_CLICK_MS = 260;
const CURSOR_FADE_MS = 420;

function runStep(el: HTMLElement, act: AutoplayStep['act']) {
  if (act === 'click') el.click();
  if (act === 'hover') el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  if (act === 'next') scrollToStyle(el, Number(el.dataset.index ?? 0) + 1);
}

/**
 * The demo's own hand: a drawn cursor that works the cards through AUTOPLAY_STEPS. The
 * visitor takes the cards over and hands them back as watchHandover decides, and the
 * sheet's transport deck shows the same state (src/client/autoplayStatus.ts). Its keys do
 * this by hand: pause holds the cards past the quiet spell, play hands them back, and reset
 * starts the walkthrough over from the library's default.
 */
export function createPlayer(host: HTMLElement, gate: DemoGate) {
  const cursor = document.createElement('span');
  cursor.className = 'demo-cursor';
  cursor.setAttribute('aria-hidden', 'true');
  cursor.hidden = true;
  host.append(cursor);
  const mover = createCursorMover(cursor, { hotspot: CURSOR_HOTSPOT });

  let playToken = 0;
  let active = false;
  let held = false;
  let fadeTimer: ReturnType<typeof setTimeout> | null = null;
  let clickTimer: ReturnType<typeof setTimeout> | null = null;

  host.dataset.userControl = 'false';

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

  /** Where on the host the cursor's tip should land to be at `at` on `el`. */
  function pointOn(el: HTMLElement, at = { x: 0.5, y: 0.5 }): Point {
    const rect = el.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    return {
      x: rect.left + rect.width * at.x - hostRect.left,
      y: rect.top + rect.height * at.y - hostRect.top,
    };
  }

  function flashClick() {
    cursor.classList.add('demo-cursor--clicking');
    if (clickTimer) clearTimeout(clickTimer);
    clickTimer = setTimeout(() => cursor.classList.remove('demo-cursor--clicking'), CURSOR_CLICK_MS);
  }

  function wait(ms: number, token: number) {
    return token === playToken ? gate.wait(ms) : Promise.resolve();
  }

  function resetCards() {
    host.querySelectorAll<HTMLElement>('ul.styles').forEach((styles) => scrollToStyle(styles, 0));
    host.dispatchEvent(new CustomEvent('variants:reset'));
  }

  /** The walkthrough run still under way, held or not. */
  let playing = 0;

  async function play() {
    const token = ++playToken;
    playing = token;
    try {
      await walk(token);
    } finally {
      if (playing === token) playing = 0;
    }
  }

  async function walk(token: number) {
    showCursor();
    for (let index = 0; token === playToken; index += 1) {
      const step = AUTOPLAY_STEPS[index % AUTOPLAY_STEPS.length];
      if (index > 0 && index % AUTOPLAY_STEPS.length === 0) resetCards();
      await wait(step.delay, token);
      if (token !== playToken) return;

      const el = host.querySelector<HTMLElement>(step.aim);
      if (!el) continue;
      // Place before showing: the first hop is a jump, and a shown cursor would spend a
      // frame at the host's corner first.
      const hop = mover.moveTo(pointOn(el, step.at));
      showCursor();
      await hop;
      if (token !== playToken) return;
      if (step.act) await wait(PRESS_DELAY_MS, token);
      if (token !== playToken) return;
      if (step.act === 'click' || step.act === 'next') flashClick();
      runStep(el, step.act);
    }
  }

  function report(state: AutoplayState) {
    reportAutoplayState(host, state);
  }

  function stopPlaying() {
    playToken += 1;
    mover.cancel();
  }

  const handover = watchHandover(host, {
    listening: () => active,
    takeOver() {
      host.dataset.userControl = 'true';
      report('user');
      stopPlaying();
      hideCursor(true);
    },
    handBack() {
      if (held || !active || reducedMotion(host)) return false;
      host.dataset.userControl = 'false';
      report('playing');
      void play();
      return true;
    },
  });

  function canPlay() {
    return active && !handover.userControl && !reducedMotion(host);
  }

  const stopCommands = onAutoplayCommand(host, (command) => {
    if (command === 'pause') {
      held = true;
      handover.takeOver();
      return;
    }
    const wasPlaying = !handover.userControl && playing !== 0 && playing === playToken;
    held = false;
    handover.release();
    if (command === 'reset') {
      stopPlaying();
      resetCards();
    }
    // Reset under reduced motion puts the cards back and waits for play
    if (reducedMotion(host)) {
      hideCursor(false);
      report('paused');
      return;
    }
    host.dataset.userControl = 'false';
    report('playing');
    if (command === 'play' && wasPlaying) return;
    if (canPlay()) void play();
  });

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const onMotionChange = () => {
    if (!reducedMotion(host)) return;
    stopPlaying();
    hideCursor(false);
    if (active) report('paused');
  };
  motionQuery.addEventListener('change', onMotionChange);

  return {
    setActive(value: boolean) {
      active = value;
      if (value) report(reducedMotion(host) ? 'paused' : handover.userControl ? 'user' : 'playing');
      // Off screen, under another page or in a hidden tab, the walkthrough's waits hold it
      // where it stands, and it carries on from there when the page is back.
      if (!value || (playing && playing === playToken)) return;
      if (canPlay()) void play();
    },
    dispose() {
      stopPlaying();
      stopCommands();
      motionQuery.removeEventListener('change', onMotionChange);
      handover.dispose();
      if (fadeTimer) clearTimeout(fadeTimer);
      if (clickTimer) clearTimeout(clickTimer);
      cursor.remove();
    },
  };
}
