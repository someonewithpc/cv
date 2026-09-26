import { onAutoplayCommand, reportAutoplayState, type AutoplayState } from '@/client/autoplayStatus';
import { createCursorMover, type Point } from '@/client/cursorMotion';
import type { DemoGate } from '@/client/frontPage';
import { watchHandover } from '@/client/walkthroughHandover';

import { initiallyEnabled } from '../config';

type Step = {
  /** CSS selector inside the playground, resolved each time the step runs. */
  aim: string;
  /** Wait before the cursor moves, in ms. */
  delay: number;
  act?: 'click';
};

const toggle = (name: string) => `.toggle:has(input[name="${name}"]) input`;

/**
 * One loop, from the config the page opens on: v2 joins and brings MariaDB, the file is
 * opened on it, then Mastodon leaves and takes its three services and search, the v3 pair
 * leaves and takes Postgres, Redis and media with them, v2 leaves and the file has no
 * services, and the three come back. Every step is a control a visitor can work too.
 */
export const WALKTHROUGH: Step[] = [
  { aim: toggle('gnusocial-v2'), delay: 1600, act: 'click' },
  { aim: '.yaml summary', delay: 2600, act: 'click' },
  { aim: '.yaml pre', delay: 900 },
  { aim: '.yaml summary', delay: 3000, act: 'click' },
  { aim: toggle('mastodon-carol'), delay: 1400, act: 'click' },
  { aim: toggle('gnusocial-alice'), delay: 2000, act: 'click' },
  { aim: toggle('gnusocial-bob'), delay: 1400, act: 'click' },
  { aim: toggle('gnusocial-v2'), delay: 2600, act: 'click' },
  { aim: toggle('gnusocial-alice'), delay: 2600, act: 'click' },
  { aim: toggle('gnusocial-bob'), delay: 1200, act: 'click' },
  { aim: toggle('mastodon-carol'), delay: 1200, act: 'click' },
  { aim: '[data-status]', delay: 1400 },
];

/** The tip of the drawn arrow, as fractions of the cursor's box. */
const CURSOR_HOTSPOT = { x: 0.12, y: 0.08 };
const PRESS_DELAY_MS = 160;
const CURSOR_CLICK_MS = 260;
const CURSOR_FADE_MS = 420;
const LOOP_REST_MS = 2400;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The playground's own hand: a drawn cursor that flips the instance toggles and opens the
 * file through WALKTHROUGH. `data-autoplay` on the host is the state, and the sheet's
 * transport deck shows the same (src/client/autoplayStatus.ts). The visitor takes over and
 * hands back as watchHandover decides. Pause holds the playground past the quiet spell,
 * play hands it back, and reset puts the opening config back and starts over.
 */
export function createPlayer(host: HTMLElement, restore: () => void, gate: DemoGate) {
  const cursor = document.createElement('span');
  cursor.className = 'demo-cursor';
  cursor.setAttribute('aria-hidden', 'true');
  cursor.hidden = true;
  host.append(cursor);
  const mover = createCursorMover(cursor, { hotspot: CURSOR_HOTSPOT });

  let token = 0;
  let active = false;
  let noteOpen = false;
  let held = false;
  let fadeTimer: ReturnType<typeof setTimeout> | null = null;

  const setState = (state: AutoplayState) => {
    host.dataset.autoplay = state;
    reportAutoplayState(host, state);
  };

  function showCursor() {
    if (fadeTimer) clearTimeout(fadeTimer);
    cursor.hidden = false;
    cursor.classList.remove('demo-cursor--fading');
  }

  function hideCursor() {
    if (fadeTimer) clearTimeout(fadeTimer);
    if (cursor.hidden) return;
    cursor.classList.add('demo-cursor--fading');
    fadeTimer = setTimeout(() => {
      cursor.hidden = true;
      cursor.classList.remove('demo-cursor--fading');
    }, CURSOR_FADE_MS);
  }

  function pointOn(el: HTMLElement): Point {
    const rect = el.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    return { x: rect.left + rect.width / 2 - hostRect.left, y: rect.top + rect.height / 2 - hostRect.top };
  }

  const wait = (ms: number, run: number) => (run === token ? gate.wait(ms) : Promise.resolve());

  function click(el: HTMLElement) {
    cursor.classList.add('demo-cursor--clicking');
    setTimeout(() => cursor.classList.remove('demo-cursor--clicking'), CURSOR_CLICK_MS);
    el.click();
  }

  /** The walkthrough run still under way, held or not. */
  let playing = 0;

  async function play() {
    const run = ++token;
    playing = run;
    try {
      await walk(run);
    } finally {
      if (playing === run) playing = 0;
    }
  }

  async function walk(run: number) {
    setState('playing');
    restore();
    for (let index = 0; run === token; index += 1) {
      const step = WALKTHROUGH[index % WALKTHROUGH.length];
      if (index > 0 && index % WALKTHROUGH.length === 0) {
        await wait(LOOP_REST_MS, run);
        if (run !== token) return;
        restore();
      }
      await wait(step.delay, run);
      if (run !== token) return;

      const el = host.querySelector<HTMLElement>(step.aim);
      if (!el || el.getClientRects().length === 0) continue;
      // Place before showing: the first hop is a jump.
      const hop = mover.moveTo(pointOn(el));
      showCursor();
      await hop;
      if (run !== token || !step.act) continue;
      await wait(PRESS_DELAY_MS, run);
      if (run !== token) return;
      click(el);
    }
  }

  function stop() {
    token += 1;
    mover.cancel();
    hideCursor();
  }

  const canPlay = () => active && !noteOpen && !held && !handover.userControl;

  const handover = watchHandover(host, {
    listening: () => active,
    takeOver() {
      stop();
      setState('user');
    },
    handBack() {
      if (!active || noteOpen || held) return false;
      void play();
      return true;
    },
  });

  onAutoplayCommand(host, (command) => {
    if (command === 'pause') {
      held = true;
      handover.takeOver();
      return;
    }
    held = false;
    handover.release();
    if (command === 'play' && host.dataset.autoplay === 'playing') return;
    stop();
    if (command === 'reset') restore();
    if (active && !noteOpen) void play();
    else setState('playing');
  });

  if (reducedMotion()) {
    setState('off');
    handover.dispose();
    return { setActive() {}, setNoteOpen() {} };
  }

  setState('playing');

  return {
    setActive(value: boolean) {
      active = value;
      // Off screen, under another page or in a hidden tab, the walkthrough's waits hold it
      // where it stands, and it carries on from there when the page is back.
      if (!value || (playing && playing === token)) return;
      if (canPlay() && host.dataset.autoplay === 'playing') void play();
    },
    setNoteOpen(value: boolean) {
      noteOpen = value;
      if (value) {
        if (host.dataset.autoplay === 'playing') stop();
        return;
      }
      if (canPlay() && host.dataset.autoplay === 'playing') void play();
    },
  };
}
