/** How long a demo has to be left alone before its walkthrough starts again. */
export const RESUME_DELAY_MS = 6000;

type HandoverOptions = {
  /** False while the demo is off screen or not its stack's front page; pointers are ignored then. */
  listening(): boolean;
  /** The visitor has taken over: stop the walkthrough where it stands. */
  takeOver(): void;
  /** The quiet spell is over. Start the walkthrough again, or return false to leave it stopped. */
  handBack(): boolean;
};

/**
 * Who drives a demo, its walkthrough or the visitor. A pointer moving over the host, a tap
 * on it or focus landing in it takes over; a resting pointer does not, so a page scrolling
 * under a still mouse leaves the walkthrough going. It starts again once the host has been
 * left alone for RESUME_DELAY_MS.
 */
export function watchHandover(host: HTMLElement, options: HandoverOptions) {
  let userControl = false;
  let resumeTimer: ReturnType<typeof setTimeout> | null = null;

  function restartResumeTimer() {
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => {
      resumeTimer = null;
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

  // focusin, not focus: focus does not bubble, so a listener here would only hear the host
  // itself and never the fields and buttons a keyboard visitor lands on.
  host.addEventListener('focusin', takeOver);
  window.addEventListener('pointerdown', onPointer);
  window.addEventListener('pointermove', onPointer);

  return {
    get userControl() {
      return userControl;
    },
    dispose() {
      if (resumeTimer) clearTimeout(resumeTimer);
      host.removeEventListener('focusin', takeOver);
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('pointermove', onPointer);
    },
  };
}
