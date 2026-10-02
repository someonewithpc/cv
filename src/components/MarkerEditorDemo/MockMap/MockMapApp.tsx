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
import { isTransportControl, onAutoplayCommand, reducedMotion, reportAutoplayState } from '@/client/autoplayStatus';
import { documentGate, watchPageActive } from '@/client/frontPage';

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

/** Convert viewport client coords into a positioned host (carousel page) at `rect`. */
function toHostPoint(rect: DOMRectReadOnly | undefined, pos: CursorPos): CursorPos {
  if (!rect) return pos;
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
            stroke="var(--accent, #222)"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
        <span className="mock-map-demo-cursor__label monospace">demo</span>
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
  /** The visitor took over deliberately; only Replay hands the walkthrough back. */
  const heldRef = useRef(false);
  const commandRef = useRef<(command: 'play' | 'pause' | 'reset') => void>(() => {});
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

  /**
   * Where the carousel page sits in the viewport. It moves only when the page resizes or
   * scrolls, so it is read once after either and kept, and the re-glue below refreshes it
   * from the boxes the browser hands over. Reading it per placement forced a style and
   * layout pass after each press and release a step had just dispatched.
   */
  const hostRectRef = useRef<DOMRectReadOnly | undefined>(undefined);
  /** Counts resizes and scrolls, so a box measured before one is not kept after it. */
  const hostMovesRef = useRef(0);
  const hostRect = () => (hostRectRef.current ??= editorPortalHost?.getBoundingClientRect());
  /**
   * The host's rect from the placement that started the current drag. Every frame of a drag
   * comes from points read when it started, so the frames keep that rect too.
   */
  const dragHostRectRef = useRef<DOMRectReadOnly | undefined>(undefined);

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
      const following = step.dragging && !step.click && dragHostRectRef.current;
      const rect = following ? dragHostRectRef.current : hostRect();
      dragHostRectRef.current = rect;
      setCursorPos(toHostPoint(rect, pos));
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
    if (!editorPortalHost) return;
    const moved = () => {
      hostMovesRef.current += 1;
      hostRectRef.current = undefined;
    };
    const resizes = new ResizeObserver(moved);
    resizes.observe(editorPortalHost);
    // The page also moves when something above it changes the document's height.
    resizes.observe(document.documentElement);
    window.addEventListener('scroll', moved, { passive: true });
    return () => {
      resizes.disconnect();
      window.removeEventListener('scroll', moved);
      moved();
    };
  }, [editorPortalHost]);

  useEffect(() => {
    const overlay = containerRef.current;
    if (!overlay || !editorPortalHost) return;
    setCursorPos(toHostPoint(hostRect(), overlayPoint(overlay, 0.42, 0.38)));
  }, [editorPortalHost]);

  // A step measures its target once, but accordion sections in the editor keep
  // animating afterwards and carry the target away from the parked cursor (the
  // stacked narrow layout shifts headers by whole sections). Re-glue the cursor
  // to the highlighted target until the next step retargets it. Each tick asks an
  // IntersectionObserver for the boxes, which the browser hands over from the next
  // frame's own layout, so the tick forces none.
  useEffect(() => {
    if (!inView || !editorPortalHost) return;
    let asked = { el: null as Element | null, moves: 0 };
    const boxes = new IntersectionObserver((entries) => {
      boxes.disconnect();
      // A resize or scroll since the tick asked: these boxes are from before it.
      if (hostMovesRef.current !== asked.moves) return;
      let host: DOMRectReadOnly | undefined;
      let target: DOMRectReadOnly | undefined;
      for (const entry of entries) {
        if (entry.target === editorPortalHost) host = entry.boundingClientRect;
        else if (entry.target === asked.el) target = entry.boundingClientRect;
      }
      if (host) hostRectRef.current = host;
      const el = activeTargetRef.current;
      if (
        !target
        || el !== asked.el
        || userControlRef.current
        || cursorPhaseRef.current !== 'demo'
      ) {
        return;
      }
      const next = toHostPoint(host ?? hostRect(), {
        x: target.left + target.width / 2,
        y: target.top + target.height / 2,
      });
      setCursorPos((prev) => (
        Math.abs(prev.x - next.x) < 0.5 && Math.abs(prev.y - next.y) < 0.5 ? prev : next
      ));
    });
    const id = window.setInterval(() => {
      const el = activeTargetRef.current;
      if (
        !el?.isConnected
        || userControlRef.current
        || cursorPhaseRef.current !== 'demo'
        || !documentGate().running
      ) {
        return;
      }
      asked = { el, moves: hostMovesRef.current };
      boxes.disconnect();
      boxes.observe(editorPortalHost);
      boxes.observe(el);
    }, 150);
    return () => {
      window.clearInterval(id);
      boxes.disconnect();
    };
  }, [editorPortalHost, inView]);

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
        if (reducedMotion(containerRef.current)) {
          setCursorPhase('gone');
          pauseAutoplay();
          return;
        }
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
        // No "paused" toast: nobody is looking at the page that just went away, and its
        // dismiss timer would keep the map busy off screen.
        controller.pause();
        clearResumeTimer();
        clearTargetRetry();
        clearDemoTargetHighlight();
        clearClickTimer();
        setCursorClicking(false);
        setCursorDragging(false);
        setCursorPhase('gone');
      }
    });

    // Hold the demo still while the note dialog covers this page.
    const stopNoteWatch = watchDrawingNote(visibilityRoot, (open) => {
      if (open) {
        controller.pause();
        setCursorPhase('gone');
      } else if (inViewRef.current && !userControlRef.current && !reducedMotion(containerRef.current)) {
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

  // Drives the sheet's transport deck (TechnicalDrawing/Page.astro).
  useEffect(() => {
    if (!inView) return;
    reportAutoplayState(containerRef.current, userControl ? 'user' : 'playing');
  }, [inView, userControl]);

  useEffect(() => onAutoplayCommand(containerRef.current, (command) => commandRef.current(command)), []);

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

  // `pressed` comes from the deck, whose keys are on the sheet itself: the visitor is
  // looking right at it, so the in-view gate that guards the idle timer does not apply.
  const resumeAutoplay = (pressed = false) => {
    if (
      (!inViewRef.current && !pressed)
      || heldRef.current
      || nativePopupRef.current
      || reducedMotion(containerRef.current)
    ) return;
    userControlRef.current = false;
    cursorPhaseRef.current = 'demo';
    setUserControl(false);
    dispatch(setAutoplayPaused(false));
    setCursorPhase('demo');
    // Under reduced motion the walkthrough never started on its own: play is its first run
    if (autoplayStartedRef.current) autoplayRef.current?.resume();
    else {
      autoplayStartedRef.current = true;
      autoplayRef.current?.start();
    }
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
    heldRef.current = false;
    nativePopupRef.current = false;
    userControlRef.current = false;
    setUserControl(false);
    dispatch(setAutoplayPaused(false));
    cursorPhaseRef.current = 'demo';
    setCursorPhase('demo');
    autoplayStartedRef.current = true;
    autoplayRef.current?.restart();
    // Reset under reduced motion puts the map back and waits for play
    if (reducedMotion(containerRef.current)) {
      cursorPhaseRef.current = 'gone';
      setCursorPhase('gone');
      pauseAutoplay();
      return;
    }
    pushToastRef.current(autoplayStartedToast());
  };

  // The deck's keys: play hands the walkthrough back, pause is an explicit take-over
  // (the one that works without a pointer), reset starts the walkthrough again. A key
  // press answers on the deck straight away rather than waiting for the state effect,
  // which only reports while the page counts as active.
  commandRef.current = (command) => {
    if (command === 'pause') {
      yieldToUser(true);
      reportAutoplayState(containerRef.current, 'user');
      return;
    }
    clearResumeTimer();
    heldRef.current = false;
    nativePopupRef.current = false;
    if (command === 'reset') restartDemo();
    else resumeAutoplay(true);
    reportAutoplayState(containerRef.current, userControlRef.current ? 'user' : 'playing');
  };

  // Never hide or teleport the real pointer — on trusted user movement, pause and
  // fade the demo cursor where it is, then resume after the user goes idle.
  // A deliberate interaction (click, tap, focus) keeps control instead, until the
  // visitor asks for the walkthrough back from the sheet's status chip.
  const yieldToUser = (keepControl = false) => {
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

    if (keepControl) {
      heldRef.current = true;
      return;
    }

    resumeTimerRef.current = setTimeout(() => {
      resumeTimerRef.current = null;
      resumeAutoplay();
    }, RESUME_DELAY_MS);
  };

  // The Space Builder scenes have always parked themselves under reduced motion; the map
  // walkthrough never checked, so the sheet's deck would read paused over a demo
  // that was still moving. The query is watched, not read once: the setting can change
  // while the page is open.
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');

    const park = () => {
      autoplayRef.current?.pause();
      clearResumeTimer();
      clearTargetRetry();
      clearDemoTargetHighlight();
      clearClickTimer();
      setCursorClicking(false);
      setCursorDragging(false);
      cursorPhaseRef.current = 'gone';
      setCursorPhase('gone');
    };

    const apply = () => {
      if (reducedMotion(containerRef.current)) {
        park();
        pauseAutoplay();
      } else if (inViewRef.current && !userControlRef.current) resumeAutoplay();
    };

    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  // Stable refs / setters only, same as the pointer handoff below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!inView) return;

    const onTrustedPointer = (e: PointerEvent) => {
      if (!e.isTrusted) return;
      // Reaching for the deck's own keys is not taking the demo over.
      if (isTransportControl(e.target)) return;
      // The page only gets pointer events again once a native popup has closed.
      nativePopupRef.current = false;
      yieldToUser(e.type === 'pointerdown');
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
  // underneath it. Hold from the moment such a control takes focus: a deliberate takeover,
  // so the sheet's chip reads "You're in control" for as long as the popup is up.
  // The editor is portaled onto the carousel page, hence document rather than the overlay.
  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      if (!isNativePopupControl(event.target)) return;
      nativePopupRef.current = true;
      yieldToUser(true);
      clearResumeTimer();
    };

    // Focus landing on another element is the visitor moving on. Focus going nowhere is
    // what opening the popup itself looks like in some browsers, so that one holds.
    const onFocusOut = (event: FocusEvent) => {
      if (!isNativePopupControl(event.target) || event.relatedTarget === null) return;
      nativePopupRef.current = false;
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
        yieldToUser(true);
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
          portalHost={editorPortalHost}
          onClose={clearSelection}
          interactive={userControl}
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
