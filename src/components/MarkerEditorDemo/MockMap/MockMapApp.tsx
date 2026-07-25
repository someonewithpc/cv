import '../markers/client-only';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from 'react-redux';

import {
  setAutoplayPaused,
  setMarkerEditingSpaceId,
  spacesSelector,
  useAppDispatch,
  useAppSelector,
  type RootState,
  type SpaceType,
} from '@/store';
import { StoreProvider } from '@/store/StoreProvider';

import { MarkerSelector } from '../markers/MarkerSelector';

import {
  AutoPlayController,
  bindUndoRedoKeys,
  type DemoCursorStep,
} from './AutoPlayController';
import { SpacePin } from './SpacePin';

import './MockMapOverlay.scss';

/** Focus zoom — leave margin so the pin isn't crushed against the frame. */
const FOCUS_SCALE = 1.55;
const RESUME_DELAY_MS = 2000;
const CURSOR_HANDOFF_MS = 420;
const CURSOR_FADE_MS = 320;
const CURSOR_CLICK_MS = 180;
const TARGET_RETRY_MS = 40;
const TARGET_RETRY_ATTEMPTS = 20;

type CursorPhase = 'demo' | 'to-pointer' | 'fading' | 'gone';
type CursorPos = { x: number; y: number };

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

function elementCenter(el: Element): CursorPos {
  const rect = el.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function overlayPoint(overlay: Element, nx: number, ny: number): CursorPos {
  const rect = overlay.getBoundingClientRect();
  return {
    x: rect.left + rect.width * nx,
    y: rect.top + rect.height * ny,
  };
}

function DemoCursor({
  x,
  y,
  phase,
  clicking,
  dragging,
}: {
  x: number;
  y: number;
  phase: CursorPhase;
  clicking: boolean;
  dragging: boolean;
}) {
  if (phase === 'gone' || typeof document === 'undefined') return null;

  return createPortal(
    (
      <div
        className={[
          'mock-map-demo-cursor',
          `mock-map-demo-cursor--${phase}`,
          clicking ? 'mock-map-demo-cursor--clicking' : '',
          dragging ? 'mock-map-demo-cursor--dragging' : '',
        ].filter(Boolean).join(' ')}
        style={{ left: x, top: y }}
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
    ),
    document.body,
  );
}

function MockMapOverlayInner() {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const spaces = useAppSelector(spacesSelector);
  const containerRef = useRef<HTMLDivElement>(null);
  const autoplayRef = useRef<AutoPlayController | null>(null);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeTargetRef = useRef<Element | null>(null);
  const pointerRef = useRef<CursorPos>({ x: 0, y: 0 });

  const [userControl, setUserControl] = useState(false);
  const [editingSpaceId, setEditingSpaceId] = useState<SpaceType['id'] | null>(null);
  const [cursorPhase, setCursorPhase] = useState<CursorPhase>('demo');
  const [cursorPos, setCursorPos] = useState<CursorPos>({ x: 0, y: 0 });
  const [cursorClicking, setCursorClicking] = useState(false);
  const [cursorDragging, setCursorDragging] = useState(false);

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

  const clearClickTimer = () => {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
  };

  const clearTargetRetry = () => {
    if (targetRetryRef.current) {
      clearTimeout(targetRetryRef.current);
      targetRetryRef.current = null;
    }
  };

  const clearDemoTargetHighlight = () => {
    activeTargetRef.current?.classList.remove('is-demo-target');
    activeTargetRef.current = null;
  };

  const restCursorPos = (): CursorPos => {
    const overlay = containerRef.current;
    if (!overlay) {
      return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    }
    return overlayPoint(overlay, 0.48, 0.44);
  };

  const applyCursorStepRef = useRef<(step: DemoCursorStep, attempt?: number) => void>(() => {});

  applyCursorStepRef.current = (step: DemoCursorStep, attempt = 0) => {
    clearTargetRetry();
    clearDemoTargetHighlight();
    setCursorDragging(Boolean(step.dragging));

    if (step.client) {
      setCursorPos(step.client);
    } else if (step.target == null) {
      setCursorPos(restCursorPos());
    } else {
      const overlay = containerRef.current;
      const el = (overlay?.querySelector(`[data-demo-target="${CSS.escape(step.target)}"]`)
        ?? document.querySelector(`[data-demo-target="${CSS.escape(step.target)}"]`));
      if (!el) {
        if (attempt < TARGET_RETRY_ATTEMPTS) {
          targetRetryRef.current = setTimeout(() => {
            targetRetryRef.current = null;
            applyCursorStepRef.current(step, attempt + 1);
          }, TARGET_RETRY_MS);
          return;
        }
        setCursorPos(restCursorPos());
      } else {
        activeTargetRef.current = el;
        el.classList.add('is-demo-target');
        setCursorPos(elementCenter(el));
      }
    }

    if (step.click) {
      clearClickTimer();
      setCursorClicking(true);
      clickTimerRef.current = setTimeout(() => {
        setCursorClicking(false);
        clickTimerRef.current = null;
      }, CURSOR_CLICK_MS);
    }
  };

  useEffect(() => {
    const overlay = containerRef.current;
    if (overlay) {
      setCursorPos(overlayPoint(overlay, 0.42, 0.38));
    }

    const controller = new AutoPlayController(
      dispatch,
      () => store.getState(),
      setEditingSpaceId,
      (step) => applyCursorStepRef.current(step),
    );
    autoplayRef.current = controller;
    controller.start();
    return () => {
      controller.destroy();
      clearResumeTimer();
      clearHandoffTimer();
      clearClickTimer();
      clearTargetRetry();
      clearDemoTargetHighlight();
    };
  }, [dispatch, store]);

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

  const demoCursorActive = cursorPhase === 'demo' || cursorPhase === 'to-pointer';

  useEffect(() => {
    document.body.classList.toggle('is-mock-map-demo-cursor', demoCursorActive);
    return () => document.body.classList.remove('is-mock-map-demo-cursor');
  }, [demoCursorActive]);

  const pauseAutoplay = () => {
    setUserControl(true);
    dispatch(setAutoplayPaused(true));
    autoplayRef.current?.pause();
    clearTargetRetry();
    clearDemoTargetHighlight();
    clearClickTimer();
    setCursorClicking(false);
    setCursorDragging(false);
  };

  const resumeAutoplay = () => {
    setUserControl(false);
    dispatch(setAutoplayPaused(false));
    autoplayRef.current?.resume();
    setCursorPhase('demo');
  };

  const beginHandoff = (clientX: number, clientY: number) => {
    clearResumeTimer();
    clearHandoffTimer();
    pauseAutoplay();

    pointerRef.current = { x: clientX, y: clientY };
    setCursorPhase('to-pointer');
    setCursorPos({ x: clientX, y: clientY });

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
        pointerRef.current = { x: e.clientX, y: e.clientY };
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

      <DemoCursor
        x={cursorPos.x}
        y={cursorPos.y}
        phase={cursorPhase}
        clicking={cursorClicking}
        dragging={cursorDragging}
      />
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
