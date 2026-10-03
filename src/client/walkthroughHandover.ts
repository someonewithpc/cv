import { inDeckGrace } from './autoplayStatus';

/** How long a demo has to be left alone before its walkthrough starts again. */
export const RESUME_DELAY_MS = 6000;

type HandoverOptions = {
  /** False while the demo is off screen or not its stack's front page; pointers are ignored then. */
  listening(): boolean;
  /** The visitor has taken over: stop the walkthrough where it stands. */
  takeOver(): void;
  /** The quiet spell is over. Start the walkthrough again, or return false to leave it stopped. */
  handBack(): boolean;
  /** False for a demo the visitor cannot work by hand: only keyboard focus and the deck take it over. */
  pointer?: boolean;
};

/**
 * Who drives a demo, its walkthrough or the visitor. A pointer moving over the host or a tap
 * on it takes over; a resting pointer does not, so a page scrolling under a still mouse
 * leaves the walkthrough going. It starts again once the host has been left alone for
 * RESUME_DELAY_MS, but not while keyboard focus is still inside it.
 *
 * Keyboard focus landing in the host takes over the same way, once, and leaving hands
 * nothing back: a Tab walk across the page would otherwise stop and restart every demo it
 * passes. A keyboard or screen reader visitor hands a demo back through the deck's play key.
 */
export function watchHandover(host: HTMLElement, options: HandoverOptions) {
  let userControl = false;
  let resumeTimer: ReturnType<typeof setTimeout> | null = null;
  /** The last thing the visitor did in the host was press, so the focus that follows is not keyboard. */
  let pressed = false;

  /** Whether `node` is in the host, through shadow roots: contains() stops at their edge. */
  function inside(node: Node | null) {
    for (let at = node; at; at = at instanceof ShadowRoot ? at.host : at.parentNode) {
      if (at === host) return true;
    }
    return false;
  }

  function keyboardFocusInside() {
    // Down into shadow roots: with a button in one focused, document.activeElement is its host.
    let focused = document.activeElement;
    while (focused?.shadowRoot?.activeElement) focused = focused.shadowRoot.activeElement;
    return focused instanceof Element && inside(focused) && focused.matches(':focus-visible');
  }

  function restartResumeTimer() {
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => {
      resumeTimer = null;
      // The next pointer move re-arms the count; leaving by keyboard does not.
      if (keyboardFocusInside()) return;
      if (options.handBack()) userControl = false;
    }, RESUME_DELAY_MS);
  }

  function takeOver() {
    if (!userControl) {
      userControl = true;
      options.takeOver();
    }
    restartResumeTimer();
  }

  // A finger on the demo is not yet a visitor taking over: on a phone the same touch starts
  // a page scroll, and the browser cancels the pointer once it does. Only a touch that lifts
  // hands the demo over. A mouse or pen takes over by moving; Chrome sends pointerover and
  // pointerenter, not pointermove, when the page scrolls the host under a still mouse.
  function onPointer(event: PointerEvent) {
    if (!event.isTrusted || !options.listening()) return;
    if (inDeckGrace(event)) return;
    const target = event.target;
    if (!(target instanceof Node) || !host.contains(target)) return;
    if (event.pointerType !== 'touch') {
      takeOver();
      return;
    }
    if (event.type !== 'pointerdown') return;
    const settle = (outcome: PointerEvent) => {
      if (outcome.pointerId !== event.pointerId) return;
      window.removeEventListener('pointerup', settle);
      window.removeEventListener('pointercancel', settle);
      if (outcome.type === 'pointerup') takeOver();
    };
    window.addEventListener('pointerup', settle);
    window.addEventListener('pointercancel', settle);
  }

  // Keyboard focus only: a click took over through its pointer, and a page turn or a script
  // moving focus is not the visitor reaching in. No quiet spell follows, so no timer. A text
  // field matches :focus-visible however it was focused, so a press is remembered until the
  // next key.
  function onFocusIn() {
    if (userControl || pressed || !keyboardFocusInside()) return;
    userControl = true;
    options.takeOver();
  }
  const onPress = () => { pressed = true; };
  const onKey = () => { pressed = false; };

  // focusin, not focus: focus does not bubble, so a listener here would only hear the host
  // itself and never the fields and buttons a keyboard visitor lands on.
  host.addEventListener('focusin', onFocusIn);
  host.addEventListener('pointerdown', onPress, true);
  host.addEventListener('keydown', onKey, true);
  if (options.pointer !== false) {
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('pointermove', onPointer);
  }

  return {
    get userControl() {
      return userControl;
    },
    /** The deck's pause key: take over the way a visitor does, without a pointer or focus. */
    takeOver,
    /** The deck's play or reset key: the walkthrough is back, so the next move takes over again. */
    release() {
      if (resumeTimer) clearTimeout(resumeTimer);
      resumeTimer = null;
      userControl = false;
    },
    dispose() {
      if (resumeTimer) clearTimeout(resumeTimer);
      host.removeEventListener('focusin', onFocusIn);
      host.removeEventListener('pointerdown', onPress, true);
      host.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('pointermove', onPointer);
    },
  };
}
