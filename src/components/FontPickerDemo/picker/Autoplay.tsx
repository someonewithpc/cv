import { type RefObject, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { isTransportControl, onAutoplayCommand, reducedMotion, reportAutoplayState } from '@/client/autoplayStatus';
import { watchDrawingNote } from '@/client/drawingNote';
import { watchPageActive } from '@/client/frontPage';

import { CURSOR_GONE, DrawnCursor, type DrawnCursorState } from './DrawnCursor';
import { Playthrough, setNativeValue } from './playthrough';
import { entranceFor, scenesFor } from './scenes';
import { demoPicker } from './demoPicker';

const RESUME_DELAY_MS = 2500;
const CURSOR_FADE_MS = 320;
const TOAST_VISIBLE_MS = 1800;
const TOAST_EXIT_MS = 320;

type Toast = { id: number; text: string; leaving: boolean };

/**
 * Plays the picker by itself while its sheet is the one in front, with a drawn cursor, and
 * hands over the moment a real pointer moves over the sheet or focus lands in the form. It
 * comes back after a pause with nothing going on. The sheet's transport deck shows the same
 * state (src/client/autoplayStatus.ts): pause holds the picker until play or reset, play
 * hands it back, and reset clears the picker and starts again from the first scene.
 */
export function Autoplay({ root }: { root: RefObject<HTMLDivElement | null> }) {
  const [cursor, setCursor] = useState<DrawnCursorState>(CURSOR_GONE);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const toastId = useRef(0);

  useEffect(() => {
    const el = root.current;
    if (!el) return;

    // The carousel page: positioned, so cursor and toasts drawn into it ride along with it
    const page = el.closest<HTMLElement>('article.technical-drawing-stack > * > section') ?? el;
    setHost(page);

    const toast = (text: string) => {
      const id = ++toastId.current;
      setToasts((prev) => [...prev, { id, text, leaving: false }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
        window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), TOAST_EXIT_MS);
      }, TOAST_VISIBLE_MS);
    };

    let fadeTimer = 0;
    const controller = new Playthrough(
      scenesFor(el),
      (state) => {
        if (state === null) {
          demoPicker.close();
          setCursor((prev) => (prev.phase === 'gone' ? prev : { ...prev, phase: 'fading' }));
          fadeTimer = window.setTimeout(() => setCursor(CURSOR_GONE), CURSOR_FADE_MS);
          return;
        }
        window.clearTimeout(fadeTimer);
        const rect = page.getBoundingClientRect();
        setCursor({ ...state, x: state.x - rect.left, y: state.y - rect.top, phase: 'demo' });
      },
      () => toast('Demo complete · looping again'),
      entranceFor(el),
    );

    let pageActive = false;
    let userControl = false;
    let noteOpen = false;
    let everPlayed = false;
    // Set by the deck's pause: the picker stays the visitor's past the quiet spell
    let held = false;
    let resumeTimer = 0;

    const play = (message?: string) => {
      if (!pageActive) return;
      // Under reduced motion the run waits for the deck's play
      if (held || userControl || reducedMotion(el)) {
        reportAutoplayState(el, 'user');
        return;
      }
      reportAutoplayState(el, 'playing');
      if (noteOpen || controller.running) return;
      controller.start();
      toast(message ?? (everPlayed ? 'Demo resumed' : 'Demo playing · move to take over'));
      everPlayed = true;
    };

    const hold = (why?: string) => {
      if (!controller.running) return;
      controller.pause();
      if (why) toast(why);
    };

    const yieldToUser = (handoff: Element | null) => {
      window.clearTimeout(resumeTimer);
      if (controller.running) {
        controller.pause(handoff);
        toast('Demo paused');
      }
      reportAutoplayState(el, 'user');
      resumeTimer = window.setTimeout(play, RESUME_DELAY_MS);
    };

    // Every page of the stack shares one grid cell, so intersection alone would keep the
    // walkthrough running behind whichever page the visitor turned to
    const stopPageWatch = watchPageActive(el, (active) => {
      pageActive = active;
      if (active) play();
      else {
        window.clearTimeout(resumeTimer);
        hold();
      }
    });

    // Only a real pointer, and only over the sheet: the scripted values never come through
    // pointer events, and a pointer elsewhere on the page is reading, not reaching in. The
    // deck is the sheet's own chrome, so reaching for its keys is not taking over
    const onPointer = (e: PointerEvent) => {
      if (!e.isTrusted || !pageActive || isTransportControl(e.target)) return;
      yieldToUser(e.target instanceof Element ? e.target : null);
    };
    page.addEventListener('pointermove', onPointer, { passive: true });
    page.addEventListener('pointerdown', onPointer, { passive: true });

    // Focus in the form is the user picking: nothing resumes until it leaves. The run's own
    // focus, on a field it types into, fires the same trusted events and is told by its flag
    const onFocusIn = (e: FocusEvent) => {
      if (!e.isTrusted || controller.scriptedFocus) return;
      window.clearTimeout(resumeTimer);
      userControl = true;
      hold('Demo paused');
      reportAutoplayState(el, 'user');
    };
    const onFocusOut = (e: FocusEvent) => {
      if (!e.isTrusted || controller.scriptedFocus) return;
      if (e.relatedTarget instanceof Node && el.contains(e.relatedTarget)) return;
      userControl = false;
      resumeTimer = window.setTimeout(play, RESUME_DELAY_MS);
    };
    el.addEventListener('focusin', onFocusIn);
    el.addEventListener('focusout', onFocusOut);

    // The sheet's note covers the picker while it is open: nothing to watch until it folds away
    const unwatchNote = watchDrawingNote(el, (open) => {
      noteOpen = open;
      window.clearTimeout(resumeTimer);
      if (open) hold();
      else play();
    });

    // Reset puts the picker back as the page opens it, as the last scene does, and the run
    // starts again from the first
    const restart = () => {
      controller.pause();
      controller.rewind();
      el.querySelector<HTMLElement>('[data-demo-target="reset"]')?.click();
      for (const name of ['google', 'embed']) {
        const input = el.querySelector<HTMLInputElement>(`[data-demo-target="${name}"]`);
        if (input && input.value !== '') setNativeValue(input, '');
      }
    };

    const stopCommands = onAutoplayCommand(el, (command) => {
      window.clearTimeout(resumeTimer);
      if (command === 'pause') {
        held = true;
        hold('Demo paused');
        reportAutoplayState(el, 'user');
        return;
      }
      held = false;
      userControl = false;
      if (command === 'reset') {
        restart();
        play('Demo restarted');
        return;
      }
      play();
    });

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotionChange = () => {
      if (reducedMotion(el)) hold();
      play();
    };
    motionQuery.addEventListener('change', onMotionChange);

    return () => {
      motionQuery.removeEventListener('change', onMotionChange);
      stopCommands();
      unwatchNote();
      stopPageWatch();
      page.removeEventListener('pointermove', onPointer);
      page.removeEventListener('pointerdown', onPointer);
      el.removeEventListener('focusin', onFocusIn);
      el.removeEventListener('focusout', onFocusOut);
      window.clearTimeout(resumeTimer);
      window.clearTimeout(fadeTimer);
      controller.pause();
    };
  }, [root]);

  if (!host) return null;

  return createPortal(
    <>
      <DrawnCursor cursor={cursor} />
      <div className="font-picker-toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={['font-picker-toast', t.leaving ? 'is-leaving' : ''].filter(Boolean).join(' ')}>
            {t.text}
          </div>
        ))}
      </div>
    </>,
    host,
  );
}
