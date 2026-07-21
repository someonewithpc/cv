import '../markers/client-only';

import { useEffect, useRef, useState } from 'react';

import {
  setAutoplayPaused,
  setMarkerEditingSpaceId,
  spacesSelector,
  useAppDispatch,
  useAppSelector,
  type SpaceType,
} from '@/store';
import { StoreProvider } from '@/store/StoreProvider';

import { MarkerSelector } from '../markers/MarkerSelector';

import { AutoPlayController, bindUndoRedoKeys } from './AutoPlayController';
import { SpacePin } from './SpacePin';

import './MockMapOverlay.scss';

/** Focus zoom — leave margin so the pin isn't crushed against the frame. */
const FOCUS_SCALE = 1.55;
const RESUME_DELAY_MS = 2000;
const CURSOR_HANDOFF_MS = 420;
const CURSOR_FADE_MS = 320;

type CursorPhase = 'demo' | 'to-pointer' | 'fading' | 'gone';

function focusTransform(space: SpaceType | undefined): {
  scale: number;
  x: number;
  y: number;
} {
  if (!space) {
    return { scale: 1, x: 0.5, y: 0.5 };
  }
  return { scale: FOCUS_SCALE, x: space.x / 100, y: space.y / 100 };
}

/** Map scene % → overlay % under the current focus transform. */
function sceneToOverlay(
  sceneX: number,
  sceneY: number,
  focus: { scale: number; x: number; y: number },
): { x: number; y: number } {
  return {
    x: (sceneX / 100) * focus.scale + (0.5 - focus.x * focus.scale),
    y: (sceneY / 100) * focus.scale + (0.5 - focus.y * focus.scale),
  };
}

function DemoCursor({
  x,
  y,
  phase,
}: {
  x: number;
  y: number;
  phase: CursorPhase;
}) {
  if (phase === 'gone') return null;

  return (
    <div
      className={`mock-map-demo-cursor mock-map-demo-cursor--${phase}`}
      style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
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
  );
}

function MockMapOverlayInner() {
  const dispatch = useAppDispatch();
  const spaces = useAppSelector(spacesSelector);
  const containerRef = useRef<HTMLDivElement>(null);
  const autoplayRef = useRef<AutoPlayController | null>(null);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerRef = useRef({ x: 0.5, y: 0.5 });

  const [userControl, setUserControl] = useState(false);
  const [editingSpaceId, setEditingSpaceId] = useState<SpaceType['id'] | null>(null);
  const [cursorPhase, setCursorPhase] = useState<CursorPhase>('demo');
  const [cursorPos, setCursorPos] = useState({ x: 0.42, y: 0.38 });

  const editingSpace = spaces.find((s) => s.id === editingSpaceId);
  const focus = focusTransform(editingSpace);

  const clearResumeTimer = () => {
    if (resumeTimerRef.current) {
      clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
  };

  const clearHandoffTimer = () => {
    if (handoffTimerRef.current) {
      clearTimeout(handoffTimerRef.current);
      handoffTimerRef.current = null;
    }
  };

  useEffect(() => {
    const controller = new AutoPlayController(dispatch, setEditingSpaceId);
    autoplayRef.current = controller;
    controller.start();
    return () => {
      controller.destroy();
      clearResumeTimer();
      clearHandoffTimer();
    };
  }, [dispatch]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    return bindUndoRedoKeys(el, dispatch);
  }, [dispatch]);

  useEffect(() => {
    const demo = containerRef.current?.closest<HTMLElement>('.mock-map-demo');
    if (!demo) return;
    demo.style.setProperty('--map-scale', String(focus.scale));
    demo.style.setProperty('--map-focus-x', String(focus.x));
    demo.style.setProperty('--map-focus-y', String(focus.y));
  }, [focus.scale, focus.x, focus.y]);

  // During demo playback, keep the simulated cursor on the active pin (or a rest spot).
  useEffect(() => {
    if (cursorPhase !== 'demo') return;
    if (editingSpace) {
      setCursorPos(sceneToOverlay(editingSpace.x, editingSpace.y, focus));
      return;
    }
    setCursorPos(sceneToOverlay(48, 44, focus));
  }, [
    cursorPhase,
    editingSpace?.id,
    editingSpace?.x,
    editingSpace?.y,
    focus.scale,
    focus.x,
    focus.y,
  ]);

  const pauseAutoplay = () => {
    setUserControl(true);
    dispatch(setAutoplayPaused(true));
    autoplayRef.current?.pause();
  };

  const resumeAutoplay = () => {
    setUserControl(false);
    dispatch(setAutoplayPaused(false));
    autoplayRef.current?.resume();
    setCursorPhase('demo');
  };

  const beginHandoff = (clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return;
    clearResumeTimer();
    clearHandoffTimer();
    pauseAutoplay();

    const rect = el.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    pointerRef.current = { x, y };

    setCursorPhase('to-pointer');
    setCursorPos({ x, y });

    handoffTimerRef.current = setTimeout(() => {
      setCursorPhase('fading');
      handoffTimerRef.current = setTimeout(() => {
        setCursorPhase('gone');
        handoffTimerRef.current = null;
      }, CURSOR_FADE_MS);
    }, CURSOR_HANDOFF_MS);
  };

  const scheduleResume = () => {
    clearResumeTimer();
    resumeTimerRef.current = setTimeout(() => {
      resumeTimerRef.current = null;
      resumeAutoplay();
    }, RESUME_DELAY_MS);
  };

  const selectSpace = (selected: SpaceType) => {
    setEditingSpaceId(selected.id);
    dispatch(setMarkerEditingSpaceId(selected.id));
  };

  const clearSelection = () => {
    setEditingSpaceId(null);
    dispatch(setMarkerEditingSpaceId(null));
  };

  const demoCursorActive = cursorPhase === 'demo' || cursorPhase === 'to-pointer';
  const selectorOverlayPos = editingSpace
    ? sceneToOverlay(editingSpace.x, editingSpace.y, focus)
    : null;

  return (
    <div
      ref={containerRef}
      className={`mock-map-overlay${demoCursorActive ? ' is-demo-cursor' : ''}`}
      tabIndex={0}
      onMouseEnter={(e) => {
        beginHandoff(e.clientX, e.clientY);
      }}
      onFocus={() => {
        pauseAutoplay();
        setCursorPhase('gone');
      }}
      onMouseMove={(e) => {
        const el = containerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        pointerRef.current = {
          x: (e.clientX - rect.left) / rect.width,
          y: (e.clientY - rect.top) / rect.height,
        };
        if (cursorPhase === 'to-pointer') {
          setCursorPos(pointerRef.current);
        }
      }}
      onMouseLeave={() => {
        if (document.activeElement === containerRef.current) return;
        scheduleResume();
      }}
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        scheduleResume();
      }}
    >
      <div className="mock-map-scene">
        <div className="mock-map-pins">
          {spaces.map((space) =>
            space.id === editingSpaceId ? null : (
              <SpacePin
                key={space.id}
                space={space}
                interactive={userControl}
                onSelect={selectSpace}
              />
            ),
          )}
        </div>
      </div>

      {editingSpace && selectorOverlayPos && (
        <MarkerSelector
          space={editingSpace}
          position={{ x: selectorOverlayPos.x * 100, y: selectorOverlayPos.y * 100 }}
          onClose={clearSelection}
        />
      )}

      <DemoCursor x={cursorPos.x} y={cursorPos.y} phase={cursorPhase} />
    </div>
  );
}

/** Client-only overlays: pins + marker selector (map SVG is server-rendered). */
export default function MockMapApp() {
  return (
    <StoreProvider>
      <MockMapOverlayInner />
    </StoreProvider>
  );
}
