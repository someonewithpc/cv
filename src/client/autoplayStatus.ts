/**
 * The transport deck in a sheet's bottom margin: which demo is driving itself, and the keys
 * a visitor presses to take the walkthrough over or hand it back.
 *
 * A demo app calls `reportAutoplayState` on its own root whenever the walkthrough starts,
 * hands over, or is switched off, and answers the keys through `onAutoplayCommand`. The deck
 * TechnicalDrawing/Page.astro renders on every sheet does the rest, so all three demos say the
 * same thing in the same place without each scene app drawing its own controls.
 */
export type AutoplayState = 'playing' | 'user' | 'off';
export type AutoplayCommand = 'play' | 'pause' | 'reset';

export const AUTOPLAY_STATE_ATTRIBUTE = 'data-autoplay-state';
const AUTOPLAY_STATE_EVENT = 'demo-autoplay-state';
const AUTOPLAY_COMMAND_EVENT = 'demo-autoplay-command';

const CAPTION: Record<AutoplayState, string> = {
  playing: 'AUTO PLAYING',
  user: 'MANUAL CONTROL',
  off: 'AUTO PLAY OFF',
};

/** Shape 2 reads as a title block cell, so the state is a value under a label. */
const VALUE: Record<AutoplayState, string> = {
  playing: 'Playing',
  user: 'Paused',
  off: 'Off',
};

const HINT: Record<AutoplayState, string> = {
  playing: 'hover or tap the sheet to take over',
  user: 'press play to hand back',
  off: 'reduced motion is on',
};

/** No pointer to hover with, so say the half of it a phone can act on. */
const TOUCH_HINT = 'tap the sheet to take over';

/**
 * Three shapes for the same deck, so the preview can show all of them: `?deck=1` fills a
 * widened bottom band, `?deck=2` stamps the deck onto the title block, `?deck=3` keeps the
 * band flush. The shape lands on <html>, which is where Page.astro's styles read it. Once
 * one shape is chosen, the other two and this switch go.
 */
const DECK_SHAPES = ['1', '2', '3'];
const DEFAULT_DECK_SHAPE = '1';

/** How long shape 3 shows the instruction before the readout settles on the state. */
const INTRO_MS = 6000;

function applyDeckShape() {
  const asked = new URLSearchParams(window.location.search).get('deck');
  document.documentElement.dataset.deck = asked && DECK_SHAPES.includes(asked)
    ? asked
    : DEFAULT_DECK_SHAPE;
}

export function reportAutoplayState(root: Element | null | undefined, state: AutoplayState) {
  if (!root || root.getAttribute(AUTOPLAY_STATE_ATTRIBUTE) === state) return;
  root.setAttribute(AUTOPLAY_STATE_ATTRIBUTE, state);
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

/** The deck is the sheet's own chrome, so hovering it is not taking the demo over. */
export function isTransportControl(node: EventTarget | null): boolean {
  return node instanceof Element && node.closest('[data-demo-transport]') !== null;
}

export function initAutoplayStatus(page: HTMLElement) {
  applyDeckShape();

  const deck = page.querySelector<HTMLElement>('[data-demo-transport]');
  const caption = deck?.querySelector<HTMLElement>('[data-demo-caption]');
  const hint = deck?.querySelector<HTMLElement>('[data-demo-hint]');
  const value = deck?.querySelector<HTMLElement>('[data-demo-value]');
  const keys = [...(deck?.querySelectorAll<HTMLButtonElement>('[data-demo-key]') ?? [])];
  if (!deck || !caption || !hint || !value || keys.length === 0) return () => {};

  const touch = window.matchMedia('(hover: none)').matches;
  let source: Element | null = null;
  let settle: ReturnType<typeof setTimeout> | undefined;

  const show = (root: Element, state: string | null) => {
    if (state !== 'playing' && state !== 'user' && state !== 'off') return;
    source = root;
    deck.hidden = false;
    deck.dataset.state = state;
    caption.textContent = CAPTION[state];
    value.textContent = VALUE[state];
    hint.textContent = state === 'playing' && touch ? TOUCH_HINT : HINT[state];

    // Shape 3 leads with the instruction and then settles on the state. Taking over
    // settles it at once: whoever just did it does not need telling how.
    if (state === 'playing') settle ??= setTimeout(() => { deck.dataset.phase = 'settled'; }, INTRO_MS);
    else deck.dataset.phase = 'settled';

    keys.forEach((key) => {
      const pressed = (key.dataset.demoKey === 'play' && state === 'playing')
        || (key.dataset.demoKey === 'pause' && state === 'user');
      key.setAttribute('aria-pressed', String(pressed));
      key.disabled = state === 'off';
    });
  };

  const onState = (event: Event) => {
    const root = event.target;
    if (root instanceof Element) show(root, root.getAttribute(AUTOPLAY_STATE_ATTRIBUTE));
  };

  keys.forEach((key) => {
    key.addEventListener('click', () => {
      const command = key.dataset.demoKey as AutoplayCommand | undefined;
      if (command && source) {
        source.dispatchEvent(new CustomEvent(AUTOPLAY_COMMAND_EVENT, { detail: { command } }));
      }
    });
  });

  page.addEventListener(AUTOPLAY_STATE_EVENT, onState);

  // An app that mounted before this ran has already reported; read it back instead.
  const reported = page.querySelector(`[${AUTOPLAY_STATE_ATTRIBUTE}]`);
  if (reported) show(reported, reported.getAttribute(AUTOPLAY_STATE_ATTRIBUTE));

  return () => page.removeEventListener(AUTOPLAY_STATE_EVENT, onState);
}
