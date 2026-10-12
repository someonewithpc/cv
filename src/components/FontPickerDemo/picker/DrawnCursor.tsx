import { useState } from 'react';

import { createDemoCursor, type DemoCursor } from '@/client/demoCursor';

import type { CursorState } from './playthrough';

export type CursorPhase = 'demo' | 'fading' | 'gone';

/**
 * The cursor a playthrough draws. React mounts it and holds its phase, which changes a few
 * times a run; demoCursor.ts takes every move, press and drag straight to the element.
 */
export function useDrawnCursor() {
  const [phase, setPhase] = useState<CursorPhase>('gone');
  const [drawn] = useState(() => {
    const cursor = createDemoCursor();
    let current: CursorPhase = 'gone';
    const to = (next: CursorPhase) => {
      if (current === next) return;
      current = next;
      setPhase(next);
    };
    return {
      cursor,
      /** Place the cursor from a playthrough's client point, inside the page whose rect is `origin` */
      show(state: CursorState, origin: { left: number; top: number }) {
        cursor.move(state.x - origin.left, state.y - origin.top);
        if (state.clicking) cursor.press();
        else cursor.release();
        cursor.drag(state.dragging);
        to('demo');
      },
      fade() {
        if (current !== 'gone') to('fading');
      },
      gone() {
        cursor.reset();
        to('gone');
      },
    };
  });
  return [drawn, phase] as const;
}

/** The pointer a walkthrough draws for itself, in the sheet's own ink. */
export function DrawnCursor({ cursor, phase }: { cursor: DemoCursor; phase: CursorPhase }) {
  if (phase === 'gone') return null;

  return (
    <div
      ref={cursor.attach}
      className={`font-picker-cursor font-picker-cursor--${phase}`}
      data-demo-cursor=""
      aria-hidden="true"
    >
      <svg viewBox="0 0 32 32" width="56" height="56" aria-hidden="true">
        <path
          d="M4 2.5v24.2l6.4-6.2 4.1 9.7 4.2-1.8-4.1-9.6H26z"
          fill="var(--sheet-canvas, var(--neutral-100, #fff))"
          stroke="var(--sheet-ink, var(--neutral-875, #222))"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
