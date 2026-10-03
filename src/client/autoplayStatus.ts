/**
 * The transport deck in a sheet's bottom margin: which demo is driving itself, and the keys
 * a visitor presses to take the walkthrough over or hand it back.
 *
 * A demo app calls `reportAutoplayState` on its own root whenever the walkthrough starts,
 * hands over, or is switched off, and answers the keys through `onAutoplayCommand`. The deck
 * TechnicalDrawing/Page.astro renders on every sheet does the rest, so all three demos say the
 * same thing in the same place without each scene app drawing its own controls.
 */
export type AutoplayState = 'playing' | 'user' | 'paused' | 'off';
export type AutoplayCommand = 'play' | 'pause' | 'reset';

export const AUTOPLAY_STATE_ATTRIBUTE = 'data-autoplay-state';
const AUTOPLAY_STATE_EVENT = 'demo-autoplay-state';
const AUTOPLAY_COMMAND_EVENT = 'demo-autoplay-command';

/**
 * On a sheet whose demo the visitor set playing under reduced motion. Until pause or reset,
 * that demo runs at full animation: its scripts read it through `reducedMotion`, and its
 * reduced-motion CSS rules skip anything inside `[data-full-motion]`.
 */
export const FULL_MOTION_ATTRIBUTE = 'data-full-motion';

/**
 * On a sheet whose artwork moves by itself with no walkthrough behind it (Stack.astro's
 * `motion` layers). Reduced motion stills that artwork, so the sheet answers the deck itself:
 * play lets the animation run at full motion, pause and reset still it again.
 */
const MOTION_DECK_ATTRIBUTE = 'data-motion-deck';

/** Nobody to take over from on such a sheet, so the deck says what the keys do instead. */
const MOTION_DECK_WORDS = {
  'data-autoplay-caption-playing': 'PLAYING',
  'data-autoplay-hint-playing': 'press pause to stop it',
};

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Reduced motion as a demo inside `el` should honour it: off while its sheet plays on request. */
export function reducedMotion(el: Element | null | undefined): boolean {
  return prefersReducedMotion() && !el?.closest(`[${FULL_MOTION_ATTRIBUTE}]`);
}

const CAPTION: Record<AutoplayState, string> = {
  playing: 'AUTO PLAYING',
  user: 'MANUAL CONTROL',
  paused: 'ANIMATION PAUSED',
  off: 'AUTO PLAY OFF',
};

const HINT: Record<AutoplayState, string> = {
  playing: 'hover, tap or tab in to take over',
  user: 'press play to hand back',
  paused: 'reduced motion is on, press play to watch',
  off: 'reduced motion is on',
};

/** No pointer to hover with, so say the half of it a phone can act on. */
const TOUCH_HINT = 'tap the sheet to take over';

/**
 * Under reduced motion a demo that is not playing is paused, whoever stopped it: the deck
 * then offers play, which runs the walkthrough at full animation.
 */
/** A readout marked data-live-in-control is a polite live region only while the visitor
    drives the demo: while the walkthrough plays, a screen reader would hear every step. */
const LIVE_IN_CONTROL = '[data-live-in-control]';

export function reportAutoplayState(root: Element | null | undefined, reported: AutoplayState) {
  const state = reported === 'user' && prefersReducedMotion() ? 'paused' : reported;
  if (!root || root.getAttribute(AUTOPLAY_STATE_ATTRIBUTE) === state) return;
  root.setAttribute(AUTOPLAY_STATE_ATTRIBUTE, state);
  root.querySelectorAll(LIVE_IN_CONTROL).forEach((region) => {
    if (state === 'playing') region.removeAttribute('aria-live');
    else region.setAttribute('aria-live', 'polite');
  });
  root.dispatchEvent(new CustomEvent(AUTOPLAY_STATE_EVENT, { bubbles: true, detail: { state } }));
}

export function onAutoplayCommand(
  root: Element | null | undefined,
  run: (command: AutoplayCommand) => void,
) {
  if (!root) return () => {};
  const listener = (event: Event) => {
    const command = (event as CustomEvent<{ command: AutoplayCommand }>).detail?.command;
    if (command) run(command);
  };
  root.addEventListener(AUTOPLAY_COMMAND_EVENT, listener);
  return () => root.removeEventListener(AUTOPLAY_COMMAND_EVENT, listener);
}

/**
 * After a deck key is pressed, a pointer moving onto the sheet is the pointer leaving the key,
 * not the visitor reaching in. Pointer take-over is ignored for this long; presses on the sheet,
 * keyboard focus and the deck's own pause key still take over at once.
 */
export const DECK_GRACE_MS = 1000;
let lastDeckPress = Number.NEGATIVE_INFINITY;

/** True while a pointer move should not take a demo over because a deck key was just pressed. */
export function inDeckGrace(event: Event): boolean {
  return event.type !== 'pointerdown' && performance.now() - lastDeckPress < DECK_GRACE_MS;
}

/** The deck is the sheet's own chrome, so hovering it is not taking the demo over. */
export function isTransportControl(node: EventTarget | null): boolean {
  return node instanceof Element && node.closest('[data-demo-transport]') !== null;
}

export function initAutoplayStatus(page: HTMLElement) {
  const deck = page.querySelector<HTMLElement>('[data-demo-transport]');
  const caption = deck?.querySelector<HTMLElement>('[data-demo-caption]');
  const hint = deck?.querySelector<HTMLElement>('[data-demo-hint]');
  const keys = [...(deck?.querySelectorAll<HTMLButtonElement>('[data-demo-key]') ?? [])];
  if (!deck || !caption || !hint || keys.length === 0) return () => {};

  const touch = window.matchMedia('(hover: none)').matches;
  let source: Element | null = null;

  const show = (root: Element, state: string | null) => {
    if (state !== 'playing' && state !== 'user' && state !== 'paused' && state !== 'off') return;
    source = root;
    if (state !== 'playing') page.removeAttribute(FULL_MOTION_ATTRIBUTE);
    deck.hidden = false;
    deck.dataset.state = state;
    // A demo that takes no input says so in its own words: data-autoplay-caption-<state>
    // and data-autoplay-hint-<state> on its root.
    caption.textContent = root.getAttribute(`data-autoplay-caption-${state}`) ?? CAPTION[state];
    hint.textContent = root.getAttribute(`data-autoplay-hint-${state}`)
      ?? (state === 'playing' && touch ? TOUCH_HINT : HINT[state]);

    keys.forEach((key) => {
      // Play and pause are toggles; reset is a momentary action and carries no pressed state.
      if (key.dataset.demoKey !== 'reset') {
        const pressed = (key.dataset.demoKey === 'play' && state === 'playing')
          || (key.dataset.demoKey === 'pause' && (state === 'user' || state === 'paused'));
        key.setAttribute('aria-pressed', String(pressed));
      }
      key.disabled = state === 'off';
    });
  };

  const onState = (event: Event) => {
    const root = event.target;
    if (root instanceof Element) show(root, root.getAttribute(AUTOPLAY_STATE_ATTRIBUTE));
  };

  const run = (command: AutoplayCommand) => {
    // Before the demo hears the key, so its own reducedMotion check already answers for it:
    // play runs the walkthrough at full animation, pause and reset leave it reduced.
    if (prefersReducedMotion()) page.toggleAttribute(FULL_MOTION_ATTRIBUTE, command === 'play');
    source?.dispatchEvent(new CustomEvent(AUTOPLAY_COMMAND_EVENT, { detail: { command } }));
  };

  keys.forEach((key) => {
    key.addEventListener('click', () => {
      lastDeckPress = performance.now();
      const command = key.dataset.demoKey as AutoplayCommand | undefined;
      if (command) run(command);
    });
  });

  page.addEventListener(AUTOPLAY_STATE_EVENT, onState);

  // Only under reduced motion: with full motion the artwork already plays, and needs no key.
  if (page.hasAttribute(MOTION_DECK_ATTRIBUTE) && prefersReducedMotion()) {
    Object.entries(MOTION_DECK_WORDS).forEach(([name, words]) => page.setAttribute(name, words));
    onAutoplayCommand(page, (command) => reportAutoplayState(page, command === 'play' ? 'playing' : 'paused'));
    reportAutoplayState(page, 'paused');
  }

  // An app that mounted before this ran has already reported; read it back instead.
  const reported = page.querySelector(`[${AUTOPLAY_STATE_ATTRIBUTE}]`);
  if (reported) show(reported, reported.getAttribute(AUTOPLAY_STATE_ATTRIBUTE));

  return () => {
    page.removeEventListener(AUTOPLAY_STATE_EVENT, onState);
  };
}
