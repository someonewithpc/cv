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
      <svg viewBox="0 0 32 32" width="56" height="56" aria-hidden="true">
        <path
          d="M4 2.5v24.2l6.4-6.2 4.1 9.7 4.2-1.8-4.1-9.6H26z"
          fill="var(--bg-900, #fff)"
          stroke="var(--fg-850, #222)"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
