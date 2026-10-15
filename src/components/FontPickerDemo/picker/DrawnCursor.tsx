import { CursorArrow } from '@/components/CursorArrow';
import type { CursorState } from './playthrough';

export type CursorPhase = 'demo' | 'fading' | 'gone';
export type DrawnCursorState = CursorState & { phase: CursorPhase };

export const CURSOR_GONE: DrawnCursorState = { x: 0, y: 0, clicking: false, dragging: false, phase: 'gone' };

/** The pointer a walkthrough draws for itself, in the sheet's own ink. */
export function DrawnCursor({ cursor }: { cursor: DrawnCursorState }) {
  if (cursor.phase === 'gone') return null;

  return (
    <div
      className={[
        'font-picker-cursor',
        `font-picker-cursor--${cursor.phase}`,
        cursor.clicking ? 'font-picker-cursor--clicking' : '',
        cursor.dragging ? 'font-picker-cursor--dragging' : '',
      ].filter(Boolean).join(' ')}
      style={{ left: cursor.x, top: cursor.y }}
      data-demo-cursor=""
      aria-hidden="true"
    >
      <CursorArrow fill="var(--sheet-canvas, var(--neutral-100, #fff))" stroke="var(--sheet-ink, var(--neutral-875, #222))" />
    </div>
  );
}
