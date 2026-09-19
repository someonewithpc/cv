import '../markers/client-only';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from 'react-redux';

import {
  markerEditingSpaceIdSelector,
  setAutoplayPaused,
  setMarkerEditingSpaceId,
  spacesSelector,
  useAppDispatch,
  useAppSelector,
  type RootState,
  type SpaceType,
} from '@/store';
import { StoreProvider } from '@/store/StoreProvider';
import { watchDrawingNote } from '@/client/drawingNote';
import { watchPageActive } from '@/client/frontPage';

import { MarkerSelector } from '../markers/MarkerSelector';

import {
  AutoPlayController,
  autoplayPausedToast,
  autoplayStartedToast,
  bindUndoRedoKeys,
  REST_CURSOR_FRACTION,
  type DemoCursorStep,
  type DemoToastPayload,
} from './AutoPlayController';
import { SpacePin } from './SpacePin';

import './MockMapOverlay.scss';

/** Focus zoom — leave margin so the pin isn't crushed against the frame. */
const FOCUS_SCALE = 1.55;
const RESUME_DELAY_MS = 2000;
const CURSOR_FADE_MS = 320;
const CURSOR_CLICK_MS = 180;
const TARGET_RETRY_MS = 40;
const TARGET_RETRY_ATTEMPTS = 20;
const TOAST_VISIBLE_MS = 1800;
const TOAST_EXIT_MS = 320;

/**
 * Controls whose popup the browser draws outside the document: the colour picker the
 * editor uses for fills and borders, a select's dropdown, a file chooser. While one is
 * open the pointer is over the popup, so the sheet sees no activity at all.
 */
const NATIVE_POPUP_SELECTOR = 'input[type="color"], input[type="file"], select';

function isNativePopupControl(node: EventTarget | null): boolean {
  return node instanceof Element && node.matches(NATIVE_POPUP_SELECTOR);
}

type CursorPhase = 'demo' | 'fading' | 'gone';
type CursorPos = { x: number; y: number };
type DemoToast = DemoToastPayload & { id: number; leaving: boolean };

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

/** Convert viewport client coords into a positioned host (carousel page). */
function toHostPoint(host: Element | null | undefined, pos: CursorPos): CursorPos {
  if (!host) return pos;
  const rect = host.getBoundingClientRect();
  return {
    x: pos.x - rect.left,
    y: pos.y - rect.top,
  };
}

function DemoCursor({
  x,
  y,
  phase,
  clicking,
  dragging,
  host,
}: {
  x: number;
  y: number;
  phase: CursorPhase;
  clicking: boolean;
  dragging: boolean;
  host: HTMLElement | null;
}) {
  if (phase === 'gone' || typeof document === 'undefined' || !host) return null;

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
        data-demo-cursor=""
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
    host,
  );
}

function MockMapOverlayInner() {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const spaces = useAppSelector(spacesSelector);
  const storeEditingSpaceId = useAppSelector(markerEditingSpaceIdSelector);
  const containerRef = useRef<HTMLDivElement>(null);
  const autoplayRef = useRef<AutoPlayController | null>(null);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeTargetRef = useRef<Element | null>(null);
  const cursorPhaseRef = useRef<CursorPhase>('gone');
  /** A native popup is up in front of the sheet, so nothing here may start moving. */
  const nativePopupRef = useRef(false);

  const [userControl, setUserControl] = useState(false);
  const [inView, setInView] = useState(false);
  const [editingSpaceId, setEditingSpaceId] = useState<SpaceType['id'] | null>(null);
  const [cursorPhase, setCursorPhase] = useState<CursorPhase>('gone');
  const [cursorPos, setCursorPos] = useState<CursorPos>({ x: 0, y: 0 });
  const [cursorClicking, setCursorClicking] = useState(false);
  const [cursorDragging, setCursorDragging] = useState(false);
  const [editorPortalHost, setEditorPortalHost] = useState<HTMLElement | null>(null);
  const [toasts, setToasts] = useState<DemoToast[]>([]);
  const userControlRef = useRef(false);
  const inViewRef = useRef(false);
  const autoplayStartedRef = useRef(false);
  const toastIdRef = useRef(0);
  const pushToastRef = useRef<(toast: DemoToastPayload) => void>(() => {});

  pushToastRef.current = (payload: DemoToastPayload) => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { ...payload, id, leaving: false }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, TOAST_EXIT_MS);
    }, TOAST_VISIBLE_MS);
  };

  const editingSpace = spaces.find((s) => s.id === editingSpaceId);
  const focus = focusTransform(editingSpace);

  // Editor diagram page clears Redux editing id — mirror that in layout so the
  // live MarkerEditor unmounts before the embed claims marker-part singletons.
  useLayoutEffect(() => {
    if (storeEditingSpaceId === null && editingSpaceId !== null) {
      setEditingSpaceId(null);
    }
  }, [storeEditingSpaceId, editingSpaceId]);

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
    return overlayPoint(overlay, REST_CURSOR_FRACTION.x, REST_CURSOR_FRACTION.y);
  };

  const applyCursorStepRef = useRef<(step: DemoCursorStep, attempt?: number) => void>(() => {});

  applyCursorStepRef.current = (step: DemoCursorStep, attempt = 0) => {
    // User owns the real pointer — don't move/show the demo cursor over them.
    if (userControlRef.current || cursorPhaseRef.current !== 'demo') {
      return;
    }

    clearTargetRetry();
    clearDemoTargetHighlight();
    setCursorDragging(Boolean(step.dragging));

    const place = (pos: CursorPos) => {
      setCursorPos(toHostPoint(editorPortalHost, pos));
    };

    if (step.client) {
      place(step.client);
    } else if (step.target == null) {
      place(restCursorPos());
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
        place(restCursorPos());
      } else {
        activeTargetRef.current = el;
        el.classList.add('is-demo-target');
        place(elementCenter(el));
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
    userControlRef.current = userControl;
  }, [userControl]);

  useEffect(() => {
    inViewRef.current = inView;
  }, [inView]);

  useEffect(() => {
    cursorPhaseRef.current = cursorPhase;
  }, [cursorPhase]);

  useEffect(() => {
    const overlay = containerRef.current;
    if (!overlay) return;
    // Attach to the carousel page (not the frame) so the editor scrolls off with it.
    setEditorPortalHost(
      overlay.closest<HTMLElement>('article.technical-drawing-stack > * > section')
      ?? overlay.closest<HTMLElement>('.mock-map-demo')
      ?? overlay,
    );
  }, []);

  useEffect(() => {
    const overlay = containerRef.current;
    if (!overlay || !editorPortalHost) return;
    setCursorPos(toHostPoint(editorPortalHost, overlayPoint(overlay, 0.42, 0.38)));
  }, [editorPortalHost]);

  // A step measures its target once, but accordion sections in the editor keep
  // animating afterwards and carry the target away from the parked cursor (the
  // stacked narrow layout shifts headers by whole sections). Re-glue the cursor
  // to the highlighted target until the next step retargets it.
  useEffect(() => {
    const id = window.setInterval(() => {
      const el = activeTargetRef.current;
      if (!el?.isConnected || userControlRef.current || cursorPhaseRef.current !== 'demo') {
        return;
      }
      const next = toHostPoint(editorPortalHost, elementCenter(el));
      setCursorPos((prev) => (
        Math.abs(prev.x - next.x) < 0.5 && Math.abs(prev.y - next.y) < 0.5 ? prev : next
      ));
    }, 150);
    return () => window.clearInterval(id);
  }, [editorPortalHost]);

  useEffect(() => {
    const overlay = containerRef.current;

    // Attach to the carousel page so leaving the map slide pauses autoplay
    // (observing .mock-map-demo alone could still look "in view" mid-snap).
    const visibilityRoot =
      overlay?.closest<HTMLElement>('article.technical-drawing-stack > * > section')
      ?? overlay?.closest<HTMLElement>('.mock-map-demo')
      ?? overlay?.closest<HTMLElement>('.technical-drawing-frame')
      ?? overlay;
    if (!visibilityRoot) return;

    const controller = new AutoPlayController(
      dispatch,
      () => store.getState(),
      setEditingSpaceId,
      (step) => applyCursorStepRef.current(step),
      (toast) => pushToastRef.current(toast),
    );
    autoplayRef.current = controller;

    // Every page of the stack shares one grid cell, so intersection alone would keep this
    // autoplay running behind whichever page the visitor turned to.
    const stopPageWatch = watchPageActive(visibilityRoot, (visible) => {
      inViewRef.current = visible;
      setInView(visible);
      if (visible) {
        if (!autoplayStartedRef.current) {
          autoplayStartedRef.current = true;
          setCursorPhase('demo');
          controller.start();
          pushToastRef.current(autoplayStartedToast());
        } else if (!userControlRef.current) {
          setCursorPhase('demo');
          controller.resume();
          pushToastRef.current(autoplayStartedToast());
        }
      } else {
        const wasPlaying = !userControlRef.current && autoplayStartedRef.current;
        controller.pause();
        clearResumeTimer();
        clearTargetRetry();
        clearDemoTargetHighlight();
        clearClickTimer();
        setCursorClicking(false);
        setCursorDragging(false);
        setCursorPhase('gone');
        if (wasPlaying) {
          pushToastRef.current(autoplayPausedToast());
        }
      }
    });

    // Hold the demo still while the note dialog covers this page.
    const stopNoteWatch = watchDrawingNote(visibilityRoot, (open) => {
      if (open) {
        controller.pause();
        setCursorPhase('gone');
      } else if (inViewRef.current && !userControlRef.current) {
        setCursorPhase('demo');
        controller.resume();
      }
    });

    return () => {
      stopPageWatch();
      stopNoteWatch();
      controller.destroy();
      autoplayStartedRef.current = false;
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
    return bindUndoRedoKeys(el, dispatch, (toast) => pushToastRef.current(toast));
  }, [dispatch]);

  useEffect(() => {
    const demo = containerRef.current?.closest<HTMLElement>('.mock-map-demo');
    if (!demo) return;
    demo.style.setProperty('--map-scale', String(focus.scale));
    demo.style.setProperty('--map-focus-x', String(focus.x));
    demo.style.setProperty('--map-focus-y', String(focus.y));
  }, [focus.scale, focus.x, focus.y]);

  const pauseAutoplay = () => {
    userControlRef.current = true;
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
    if (!inViewRef.current || nativePopupRef.current) return;
    userControlRef.current = false;
    cursorPhaseRef.current = 'demo';
    setUserControl(false);
    dispatch(setAutoplayPaused(false));
    setCursorPhase('demo');
    autoplayRef.current?.resume();
    pushToastRef.current(autoplayStartedToast());
  };

  const restartDemo = () => {
    clearResumeTimer();
    clearHandoffTimer();
    clearTargetRetry();
    clearDemoTargetHighlight();
    clearClickTimer();
    setCursorClicking(false);
    setCursorDragging(false);
    userControlRef.current = false;
    setUserControl(false);
    dispatch(setAutoplayPaused(false));
    cursorPhaseRef.current = 'demo';
    setCursorPhase('demo');
    autoplayRef.current?.restart();
    pushToastRef.current(autoplayStartedToast());
  };

  // Never hide or teleport the real pointer — on trusted user movement, pause and
  // fade the demo cursor where it is, then resume after the user goes idle.
  const yieldToUser = () => {
    clearResumeTimer();
    if (cursorPhaseRef.current === 'demo') {
      clearHandoffTimer();
      cursorPhaseRef.current = 'fading';
      pauseAutoplay();
      setCursorPhase('fading');
      pushToastRef.current(autoplayPausedToast());
      handoffTimerRef.current = setTimeout(() => {
        cursorPhaseRef.current = 'gone';
        setCursorPhase('gone');
        handoffTimerRef.current = null;
      }, CURSOR_FADE_MS);
    } else if (!userControlRef.current) {
      pauseAutoplay();
      cursorPhaseRef.current = 'gone';
      setCursorPhase('gone');
      pushToastRef.current(autoplayPausedToast());
    }

    resumeTimerRef.current = setTimeout(() => {
      resumeTimerRef.current = null;
      resumeAutoplay();
    }, RESUME_DELAY_MS);
  };

  useEffect(() => {
    if (!inView) return;

    const onTrustedPointer = (e: PointerEvent) => {
      if (!e.isTrusted) return;
      // The page only gets pointer events again once a native popup has closed.
      nativePopupRef.current = false;
      yieldToUser();
    };

    window.addEventListener('pointermove', onTrustedPointer, { passive: true });
    window.addEventListener('pointerdown', onTrustedPointer, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onTrustedPointer);
      window.removeEventListener('pointerdown', onTrustedPointer);
    };
  // yieldToUser closes over stable refs / setters; rebind when visibility changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, dispatch]);

  // Opening a native popup takes the pointer off the sheet, so the idle timer used to hand
  // the demo back while the picker was still open and the walkthrough edited the marker
  // underneath it. Hold from the moment such a control takes focus until it gives it up.
  // The editor is portaled onto the carousel page, hence document rather than the overlay.
  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      if (!isNativePopupControl(event.target)) return;
      nativePopupRef.current = true;
      yieldToUser();
      clearResumeTimer();
    };

    // Focus landing on another element is the visitor moving on. Focus going nowhere is
    // what opening the popup itself looks like in some browsers, so that one holds.
    const onFocusOut = (event: FocusEvent) => {
      if (!isNativePopupControl(event.target) || event.relatedTarget === null) return;
      nativePopupRef.current = false;
      yieldToUser();
    };

    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  // Same stable refs / setters as the pointer handoff above.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      className="mock-map-overlay"
      tabIndex={0}
      onFocus={() => {
        yieldToUser();
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

      <button
        type="button"
        className="mock-map-restart"
        title="Restart the demo"
        onClick={restartDemo}
      >
        <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
          <path
            d="M15.5 5.5A6.5 6.5 0 1 0 16.9 11M15.5 5.5V2M15.5 5.5H12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Restart
      </button>

      {editingSpace && selectorOverlayPos && (
        <MarkerSelector
          space={editingSpace}
          position={{ x: selectorOverlayPos.x * 100, y: selectorOverlayPos.y * 100 }}
          portalHost={editorPortalHost}
          onClose={clearSelection}
        />
      )}

      {toasts.length > 0 && (
        <div className="mock-map-toasts" aria-live="polite">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`mock-map-toast${toast.leaving ? ' is-leaving' : ''}`}
            >
              {toast.keys && toast.keys.length > 0 && (
                <span className="mock-map-toast__keys">
                  {toast.keys.map((key, index) => (
                    <kbd key={`${toast.id}-${index}`}>{key}</kbd>
                  ))}
                </span>
              )}
              <span className="mock-map-toast__action">{toast.action}</span>
            </div>
          ))}
        </div>
      )}

      <DemoCursor
        x={cursorPos.x}
        y={cursorPos.y}
        phase={cursorPhase}
        clicking={cursorClicking}
        dragging={cursorDragging}
        host={editorPortalHost}
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
