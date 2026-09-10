import { type RefObject, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { type CursorState, Playthrough } from './playthrough';
import { scenesFor } from './scenes';
import { demoPicker } from './demoPicker';

const RESUME_DELAY_MS = 2500;
const CURSOR_FADE_MS = 320;
const TOAST_VISIBLE_MS = 1800;
const TOAST_EXIT_MS = 320;

type Phase = 'demo' | 'fading' | 'gone';
type Cursor = CursorState & { phase: Phase };
type Toast = { id: number; text: string; leaving: boolean };

const GONE: Cursor = { x: 0, y: 0, clicking: false, dragging: false, phase: 'gone' };

/**
 * Plays the picker by itself while its sheet is in view, with a drawn cursor, and hands over
 * the moment a real pointer moves over the sheet or focus lands in the form. It comes back
 * after a pause with nothing going on.
 */
export function Autoplay({ root }: { root: RefObject<HTMLDivElement | null> }) {
  const [cursor, setCursor] = useState<Cursor>(GONE);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const toastId = useRef(0);

  useEffect(() => {
    const el = root.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

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
          fadeTimer = window.setTimeout(() => setCursor(GONE), CURSOR_FADE_MS);
          return;
        }
        window.clearTimeout(fadeTimer);
        const rect = page.getBoundingClientRect();
        setCursor({ ...state, x: state.x - rect.left, y: state.y - rect.top, phase: 'demo' });
      },
      () => toast('Demo complete · looping again'),
    );

    let inView = false;
    let userControl = false;
    let everPlayed = false;
    let resumeTimer = 0;

    const play = () => {
      if (!inView || userControl || controller.running) return;
      controller.start();
      toast(everPlayed ? 'Demo resumed' : 'Demo playing · move to take over');
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
      resumeTimer = window.setTimeout(play, RESUME_DELAY_MS);
    };

    // Viewport-rooted: against the stack, the front page reads as in view wherever the
    // document is scrolled
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      if (inView) play();
      else {
        window.clearTimeout(resumeTimer);
        hold();
      }
    }, { threshold: 0.6 });
    observer.observe(page);

    // Only a real pointer, and only over the sheet: the scripted values never come through
    // pointer events, and a pointer elsewhere on the page is reading, not reaching in
    const onPointer = (e: PointerEvent) => {
      if (e.isTrusted && inView) yieldToUser(e.target instanceof Element ? e.target : null);
    };
    page.addEventListener('pointermove', onPointer, { passive: true });
    page.addEventListener('pointerdown', onPointer, { passive: true });

    // Focus in the form is the user picking: nothing resumes until it leaves
    const onFocusIn = (e: FocusEvent) => {
      if (!e.isTrusted) return;
      window.clearTimeout(resumeTimer);
      userControl = true;
      hold('Demo paused');
    };
    const onFocusOut = (e: FocusEvent) => {
      if (!e.isTrusted || (e.relatedTarget instanceof Node && el.contains(e.relatedTarget))) return;
      userControl = false;
      resumeTimer = window.setTimeout(play, RESUME_DELAY_MS);
    };
    el.addEventListener('focusin', onFocusIn);
    el.addEventListener('focusout', onFocusOut);

    return () => {
      observer.disconnect();
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
      {cursor.phase !== 'gone' && (
        <div
          className={[
            'font-picker-cursor',
            `font-picker-cursor--${cursor.phase}`,
            cursor.clicking ? 'font-picker-cursor--clicking' : '',
            cursor.dragging ? 'font-picker-cursor--dragging' : '',
          ].filter(Boolean).join(' ')}
          style={{ left: cursor.x, top: cursor.y }}
          aria-hidden="true"
        >
          <svg viewBox="0 0 32 32" width="56" height="56">
            <path
              d="M4 2.5v24.2l6.4-6.2 4.1 9.7 4.2-1.8-4.1-9.6H26z"
              fill="var(--bg-900, #fff)"
              stroke="var(--fg-850, #222)"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}
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
