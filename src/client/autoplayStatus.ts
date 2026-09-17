/**
 * Sheet-level status for the demos that play by themselves.
 *
 * A demo app calls `reportAutoplayState` on its own root whenever the walkthrough starts, hands
 * over, or is switched off; the chip TechnicalDrawing/Page.astro renders on every sheet listens
 * for the event on its way up and says so in the CV's own voice, so the signal reads the same on
 * all three demos without each scene app drawing its own.
 */
export type AutoplayState = 'playing' | 'user' | 'off';

export const AUTOPLAY_STATE_ATTRIBUTE = 'data-autoplay-state';
const AUTOPLAY_STATE_EVENT = 'demo-autoplay-state';
/** Fired back on the reporting root when the visitor asks for the walkthrough again. */
export const AUTOPLAY_REPLAY_EVENT = 'demo-replay';

const COPY: Record<AutoplayState, string> = {
  playing: 'Auto-playing. Hover or tap to take over.',
  user: "You're in control.",
  off: 'Auto-play is off for reduced motion.',
};

export function reportAutoplayState(root: Element | null | undefined, state: AutoplayState) {
  if (!root || root.getAttribute(AUTOPLAY_STATE_ATTRIBUTE) === state) return;
  root.setAttribute(AUTOPLAY_STATE_ATTRIBUTE, state);
  root.dispatchEvent(new CustomEvent(AUTOPLAY_STATE_EVENT, { bubbles: true, detail: { state } }));
}

export function onReplayRequest(root: Element | null | undefined, replay: () => void) {
  if (!root) return () => {};
  root.addEventListener(AUTOPLAY_REPLAY_EVENT, replay);
  return () => root.removeEventListener(AUTOPLAY_REPLAY_EVENT, replay);
}

export function initAutoplayStatus(page: HTMLElement) {
  const chip = page.querySelector<HTMLElement>('[data-demo-status]');
  const text = chip?.querySelector<HTMLElement>('[data-demo-status-text]');
  const replay = chip?.querySelector<HTMLButtonElement>('[data-demo-status-replay]');
  if (!chip || !text || !replay) return () => {};

  let source: Element | null = null;

  const show = (root: Element, state: string | null) => {
    if (state !== 'playing' && state !== 'user' && state !== 'off') return;
    source = root;
    chip.hidden = false;
    chip.dataset.state = state;
    text.textContent = COPY[state];
    replay.hidden = state !== 'user';
  };

  const onState = (event: Event) => {
    const root = event.target;
    if (root instanceof Element) show(root, root.getAttribute(AUTOPLAY_STATE_ATTRIBUTE));
  };

  replay.addEventListener('click', () => {
    source?.dispatchEvent(new CustomEvent(AUTOPLAY_REPLAY_EVENT));
  });
  page.addEventListener(AUTOPLAY_STATE_EVENT, onState);

  // An app that mounted before this ran has already reported; read it back instead.
  const reported = page.querySelector(`[${AUTOPLAY_STATE_ATTRIBUTE}]`);
  if (reported) show(reported, reported.getAttribute(AUTOPLAY_STATE_ATTRIBUTE));

  return () => page.removeEventListener(AUTOPLAY_STATE_EVENT, onState);
}
