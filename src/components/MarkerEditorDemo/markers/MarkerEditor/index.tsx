import '../client-only';

import { faArrowRotateLeft, faArrowRightFromBracket } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from 'react-dom';
import { v4 as uuidv4 } from 'uuid';
import cx from 'classnames';
import _startCase from 'lodash/startCase';

import { useRect } from '../../hooks/useRect';
import { mapRange } from '../../lib/mapRange';
import { addMarker, dataUrlToSvg, groupedUndo, markersSelector, setSpaceMarker, spacesSelector, updateMarker, useAppDispatch, useAppSelector } from '../../store';
import type { MarkerType, SpaceType } from '../../store';
import { useRootElementEvents } from '../../hooks/useRootElementEvents';
import { useLiveMarkerEditorSession } from '../liveMarkerEditorSession';

import {
  svgRef,
  markers,
  markerStepContent,
  markerConfigurationComponents,
  markerThumbnailComponents,
  useMarkerReactiveState,
  useControlPointIndicatorRefs,
  useSyncSnappingControlPointsState,
  disabledStepCombinations,
} from "./markerParts";
import type { StateType, Markers, StepsType } from "./markerParts";
import { MarkerPart, Point } from "./markerParts/shared";
import { serializeMarker, deserializeMarker } from './markerParts/shared/serialization';
import { useUpdateDecorationSnapCenter } from "./useUpdateDecorationSnapCenter";
import { onOptionKey } from './listboxKeys';

import './MarkerEditor.scss';

// Hoisted: the hook re-binds its listeners whenever this array is a new one.
const KEY_EVENTS: ('keydown' | 'keyup')[] = ['keydown', 'keyup'];

const MARKER_EDITING_CIRCLE_RADIUS = 0.0375;
const MARKER_EDITING_CROSS_RADIUS = 0.0625;
const CONTROL_POINT_INDICATOR_STROKE_WIDTH = 0.00625;

export const defaultActiveState = { shape: 'teardrop', decoration: 'customIcon', shapeBorder: 'solid', shapeBorderColor: 'solid', decorationBorder: 'none', decorationBorderColor: 'solid', shapeFill: 'solid', decorationFill: 'solid', decorationFont: 'font' } as const;

// The dialog's keyboard stops in document order. A closed step keeps its boxes
// (content-visibility) and checkVisibility() ignores inert, so both are ruled out by hand.
function tabbables(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>('button, input, select, textarea, summary, a[href], [tabindex]'))
    .filter((el) => {
      if (el.tabIndex < 0 || el.matches(':disabled') || el.closest('[inert]') || !el.checkVisibility()) return false;
      const closed = el.closest('details:not([open])');
      return !closed || (el.tagName === 'SUMMARY' && el.parentElement === closed);
    });
}

function resetAllMarkerParts() {
  Object.values(markers).forEach((step) => {
    Object.values(step).forEach((part) => {
      part.reset();
    });
  });
}

export function MarkerEditor({
  space,
  baseMarkerId,
  isNewMarker,
  onClose,
  portalHost,
  embed = false,
  focusOnOpen = false,
}: {
  space: SpaceType;
  baseMarkerId: MarkerType['baseMarkerId'];
  isNewMarker: boolean;
  onClose: () => void;
  portalHost?: HTMLElement | null;
  /** Render in-place (no portal) for static diagram pages. */
  embed?: boolean;
  /** Move focus onto the first control at mount: the open was the visitor's. */
  focusOnOpen?: boolean;
}) {
  const dispatch = useAppDispatch();
  const storeSpaces = useAppSelector(spacesSelector);
  const storeMarkers = useAppSelector(markersSelector);

  const [state, setState] = useState<StateType>({
    active: { ...defaultActiveState },
    step: 'shape',
    draggedControlPoint: undefined,
    snappingDisabled: false,
    previousDecorationSnapCenter: null,
  });

  // Live map sessions own the singleton marker parts; diagram embed waits on this.
  useLiveMarkerEditorSession(!embed);

  // Marker parts are process-wide singletons — reset + reload whenever this editor session changes,
  // otherwise leftover geometry/text from the previous marker leaks into the next edit.
  useLayoutEffect(() => {
    resetAllMarkerParts();
    const sourceMarker = isNewMarker
      ? undefined
      : (storeMarkers.find((m) => m.id === baseMarkerId) ?? storeMarkers.find((m) => m.id === space.markerId));
    const active = { ...defaultActiveState, ...(deserializeMarker(sourceMarker) ?? {}) };
    const shapePart = (markers.shape as Record<string, MarkerPart & { center?: Point }>)[active.shape];
    const shapeCenter = shapePart?.center;

    // Diagram embed: park the decoration on the shape center (autoplay may have nudged it).
    if (embed && shapeCenter) {
      const decorationPart = (markers.decoration as Record<string, MarkerPart & {
        controlPoints?: { center?: Point; sizeCP?: Point };
      }>)[active.decoration];
      if (decorationPart?.controlPoints?.center) {
        decorationPart.controlPoints.center = new Point(shapeCenter.x, shapeCenter.y);
        // Keep the icon modest so it reads as centered in the teardrop head.
        if (decorationPart.controlPoints.sizeCP) {
          decorationPart.controlPoints.sizeCP = new Point(shapeCenter.x + 0.28, shapeCenter.y);
        }
      }
    }

    // Mark decoration as already aligned with this shape so re-open doesn't yank a
    // user/demo nudge back onto the shape center via useUpdateDecorationSnapCenter.
    setState({
      active,
      step: 'shape',
      draggedControlPoint: undefined,
      snappingDisabled: false,
      previousDecorationSnapCenter: shapeCenter
        ? new Point(shapeCenter.x, shapeCenter.y)
        : null,
    });
    // Only re-seed when the edited marker identity changes — not on every store update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [space.markerId, isNewMarker, baseMarkerId, embed]);

  const reactiveState = useMarkerReactiveState();

  const { rect: svgRect, measureRef: measureSvgRef } = useRect(svgRef, [state]);

  const controlPointIndicatorRefs = useControlPointIndicatorRefs();

  const activePart = useMemo(
    () => (markers[state.step] as any)[state.active[state.step]] as MarkerPart,
    [state],
  );
  const activeControlPointIndicatorRefs = useMemo(
    () => controlPointIndicatorRefs[state.step][state.active[state.step]],
    [state, controlPointIndicatorRefs],
  );

  const updateAll = useCallback(() => {
    Object.entries(markers)
      .forEach(([step, options]) => {
        Object.entries(options)
          .forEach(([name, part]) => {
            (Object.entries(part.controlPoints) as [string, Point][])
              .forEach(([cpName, cp]) => {
                (['user', 'constrained'] as const)
                  .forEach((type) => {
                    controlPointIndicatorRefs[step][name][cpName][type].current?.style.setProperty('translate', cp.toCSSTranslate());
                  });
              });
          });
      });

    Object.entries(state.active)
      .forEach(([step, partName]) => {
        markerStepContent[step].update(
          ((markers[step as keyof Markers] as any)[partName] as MarkerPart).Content({ space, extraProps: {} }),
        );
      });
  }, [state, controlPointIndicatorRefs, space]);

  // Ensure Content is updated on the first render, when regular state changes, or when the reactive getReactiveStateSnapshot state changes
  useEffect(updateAll, [state, reactiveState, updateAll]);

  // Auto-move decoration to shape center when shape changes, unless user already moved it
  useUpdateDecorationSnapCenter(state, setState, updateAll);

  // Because we bypass React, to reset them we must also do so manually, unfortunately
  const reset = useCallback(() => {
    (markers[state.step] as any)[state.active[state.step]]?.reset();
    setState((prev) => ({ ...prev, previousDecorationSnapCenter: null }));
    updateAll();
  }, [state, updateAll]);

  useSyncSnappingControlPointsState(state);

  useRootElementEvents(
    KEY_EVENTS,
    useCallback(
      (e: KeyboardEvent) => {
        if (state.draggedControlPoint && e.key === 'Shift') {
          e.preventDefault();
          e.stopPropagation();

          setState((prev) => ({ ...prev, snappingDisabled: e.shiftKey }));
        }
      },
      [state.draggedControlPoint],
    ),
  );

  const saveAndClose = useCallback(() => {
    groupedUndo.batch(() => {
      const source = serializeMarker(state, space);
      const resolvedSource = dataUrlToSvg(source);

      if (isNewMarker) {
        const id = space.markerId ?? uuidv4();
        dispatch(setSpaceMarker({ spaceId: space.id, markerId: id }));
        if (storeMarkers.some((m) => m.id === id)) {
          dispatch(updateMarker({
            id,
            source,
            resolvedSource,
            baseMarkerId,
            kind: 'editor',
          }));
        } else {
          dispatch(addMarker({
            id,
            baseMarkerId: baseMarkerId,
            source,
            resolvedSource,
            size: [57, 57],
            anchor: [57 / 2, 57],
            popupAnchor: [0, 57 * -0.70],
            kind: 'editor',
          }));
        }
      } else {
        dispatch(updateMarker({
          id: space.markerId,
          source,
          resolvedSource,
        }));
      }

      if (baseMarkerId !== undefined) {
        storeMarkers
          .filter((m) => m.id !== space.markerId && (m.baseMarkerId === baseMarkerId || m.id === baseMarkerId))
          .forEach((m) => {
            const s = storeSpaces.find((s) => s.markerId === m.id);
            // Default marker, or newly created marker, won't have a matching space
            if (!s) { return; }

            const source = serializeMarker(state, s);
            dispatch(updateMarker({
              id: m.id,
              source,
              resolvedSource: dataUrlToSvg(source),
            }));
          });
      }
    });
    onClose();
  }, [onClose, state, space, storeMarkers, dispatch, isNewMarker, baseMarkerId, storeSpaces]);

  useEffect(() => {
    if (embed) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, embed]);

  const editorRef = useRef<HTMLDivElement>(null);

  // Where each handle was put by the keys, before any snap. Stepping from the snapped point
  // would land back inside the snap radius and never get out.
  const keyedPoints = useRef(new Map<string, Point>());

  const moveControlPoint = (name: string, point: Point) => {
    if (!activePart) return;
    activePart.controlPoints[name] = point;
    updateAll();
    activeControlPointIndicatorRefs[name]['user'].current!.style.setProperty('translate', point.toCSSTranslate());
  };

  /** The handles for a pointer that is not a mouse; the walkthrough and a mouse use the mouse events. */
  const dragControlPoint = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!state.draggedControlPoint || e.pointerType === 'mouse') return;
    e.preventDefault();
    moveControlPoint(state.draggedControlPoint, new Point(
      mapRange(e.clientX, svgRect!.left, svgRect!.right, -1, 1),
      mapRange(e.clientY, svgRect!.top, svgRect!.bottom, -1, 1),
    ));
  };

  const onControlPointKey = (e: ReactKeyboardEvent<SVGGElement>, name: string) => {
    const step = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, number[]>)[e.key];
    if (!step || !activePart || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const from = keyedPoints.current.get(name) ?? activePart.controlPoints[name];
    const size = e.shiftKey ? 0.25 : 0.0625;
    const clamp = (value: number) => Math.min(1, Math.max(-1, value));
    const to = new Point(clamp(from.x + step[0] * size), clamp(from.y + step[1] * size));
    keyedPoints.current.set(name, to);
    moveControlPoint(name, new Point(to.x, to.y));
    if (state.previousDecorationSnapCenter !== null) {
      setState((prev) => ({ ...prev, previousDecorationSnapCenter: null }));
    }
  };

  // A visitor's open moves focus onto the dialog's first control; the walkthrough's opens
  // leave focus where the visitor has it. The selector gives focus back when this closes.
  useEffect(() => {
    if (embed || !focusOnOpen) return;
    tabbables(editorRef.current)[0]?.focus({ preventScroll: true });
  }, [embed, focusOnOpen]);

  // Horizontal / shift-wheel over the editor chrome should still move the carousel.
  // (The dimmed backdrop already passes through via pointer-events: none.)
  useEffect(() => {
    if (embed || !portalHost) return;

    const stack =
      portalHost.closest<HTMLElement>('article.technical-drawing-stack')
      ?? portalHost.querySelector<HTMLElement>('article.technical-drawing-stack');
    const editor = editorRef.current;
    if (!stack || !editor) return;

    const onWheel = (e: WheelEvent) => {
      const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey;
      if (!horizontal) return;

      const delta = e.shiftKey && e.deltaX === 0 ? e.deltaY : e.deltaX || e.deltaY;
      stack.scrollLeft += delta;
      e.preventDefault();
    };

    editor.addEventListener('wheel', onWheel, { passive: false });
    return () => editor.removeEventListener('wheel', onWheel);
  }, [portalHost, embed]);

  if (!embed && !portalHost) return null;

  const editor = (
      <div
        ref={editorRef}
        id={embed ? 'marker-editor-embed' : 'marker-editor'}
        className={cx('marker-editor', { 'marker-editor--embed': embed })}
        role="dialog"
        aria-modal={!embed}
        aria-label="Marker editor"
        onKeyDown={(e) => {
          // Keys pressed in the editor stay in it: an arrow would otherwise turn the paper
          // stack under the dialog. That also keeps them from the window listener above, so
          // Escape is answered here, where focus is, before the event is stopped.
          if (e.key === 'Escape' && !embed) {
            e.preventDefault();
            onClose();
          }
          // The dialog is modal: Tab past its last control comes back round to the first,
          // and Shift+Tab off the first lands on the last.
          if (e.key === 'Tab' && !embed) {
            const stops = tabbables(e.currentTarget);
            const at = stops.indexOf(document.activeElement as HTMLElement);
            const wrap = e.shiftKey ? (at <= 0 ? stops[stops.length - 1] : undefined) : (at === stops.length - 1 ? stops[0] : undefined);
            if (wrap) {
              e.preventDefault();
              wrap.focus({ preventScroll: true });
            }
          }
          e.stopPropagation();
        }}
      >
        <div className="wrapper">
          <article>
            <header>
              <button
                type="button"
                title="Go back"
                data-demo-target="editor:save"
                onClick={saveAndClose}
              >
                <FontAwesomeIcon
                  icon={faArrowRightFromBracket}
                  color="var(--marker-chrome-icon)"
                />
              </button>
              <button type="button" title="Reset" onClick={reset}>
                <FontAwesomeIcon
                  icon={faArrowRotateLeft}
                  color="var(--marker-chrome-icon)"
                />
              </button>
            </header>
            <section className="marker-preview">
              {activePart && (
                <svg
                  id={`marker-${space.markerId}`}
                  viewBox="-1 -1 2 2"
                  ref={measureSvgRef}
                  style={{ position: 'relative' }}
                  xmlns="http://www.w3.org/2000/svg"
                  onMouseLeave={() => {
                    if (!state.draggedControlPoint) return;

                    activeControlPointIndicatorRefs[state.draggedControlPoint]['user'].current!
                      .style.setProperty('translate', activePart.controlPoints[state.draggedControlPoint].toCSSTranslate());
                  }}
                  onMouseMove={(e) => {
                    if (!state.draggedControlPoint) return;

                    e.stopPropagation();
                    e.preventDefault();

                    // getBoundingClientRect is viewport-relative — use clientX/Y, not pageX/Y
                    // (page coords break as soon as the document is scrolled and clamp to y=1).
                    const newPoint = new Point(
                      mapRange(e.clientX, svgRect!.left, svgRect!.right, -1, 1),
                      mapRange(e.clientY, svgRect!.top, svgRect!.bottom, -1, 1),
                    );
                    activePart.controlPoints[state.draggedControlPoint] = newPoint;

                    updateAll();

                    // Update the dragged control point indicator to the position the user dragged to
                    activeControlPointIndicatorRefs[state.draggedControlPoint]['user'].current!
                      .style.setProperty('translate', newPoint.toCSSTranslate());
                  }}
                  onMouseUp={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setState((prev) => ({ ...prev, draggedControlPoint: undefined, previousDecorationSnapCenter: null }));
                  }}
                  onPointerMove={dragControlPoint}
                  onPointerUp={(e) => {
                    if (e.pointerType === 'mouse' || !state.draggedControlPoint) return;
                    setState((prev) => ({ ...prev, draggedControlPoint: undefined, previousDecorationSnapCenter: null }));
                  }}
                  onPointerCancel={(e) => {
                    if (e.pointerType === 'mouse' || !state.draggedControlPoint) return;
                    setState((prev) => ({ ...prev, draggedControlPoint: undefined, previousDecorationSnapCenter: null }));
                  }}
                >
                  {Object.values(markerStepContent)}

                  {Object.keys(activePart.controlPoints)
                    .map((controlPointName) => (
                      <g key={controlPointName}>
                        <g
                          ref={activeControlPointIndicatorRefs[controlPointName]['user']}
                          data-demo-target={`editor:cp:${controlPointName}`}
                          style={{
                            translate: activePart.controlPoints[controlPointName].toCSSTranslate(),
                          }}
                          className="control-point"
                          tabIndex={0}
                          aria-label={`${_startCase(controlPointName.replace(/CP$/, ''))} handle`}
                          aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            setState((prev) => ({ ...prev, draggedControlPoint: controlPointName as any }));
                          }}
                          onPointerDown={(e) => {
                            if (e.pointerType === 'mouse') return;
                            e.stopPropagation();
                            e.preventDefault();
                            e.currentTarget.ownerSVGElement?.setPointerCapture(e.pointerId);
                            setState((prev) => ({ ...prev, draggedControlPoint: controlPointName as any }));
                          }}
                          onFocus={() => keyedPoints.current.delete(controlPointName)}
                          onKeyDown={(e) => onControlPointKey(e, controlPointName)}
                        >
                          {/* We position the indicators on the top left and use CSS `translate` to move them to the appropriate place in order to bypass React's rendering, as it was unusably slow */}
                          <circle cx={-1} cy={-1} r={MARKER_EDITING_CIRCLE_RADIUS} style={{ stroke: 'var(--marker-handle-stroke)', fill: 'var(--marker-handle-fill)' }} strokeWidth={CONTROL_POINT_INDICATOR_STROKE_WIDTH} />
                        </g>
                        <g
                          ref={activeControlPointIndicatorRefs[controlPointName]['constrained']}
                          style={{
                            pointerEvents: 'none',
                            translate: activePart.controlPoints[controlPointName].toCSSTranslate(),
                          }}
                        >
                          <line x1={-1 - MARKER_EDITING_CROSS_RADIUS} y1={-1} x2={-1 + MARKER_EDITING_CROSS_RADIUS} y2={-1} style={{ stroke: 'var(--marker-constraint-stroke)' }} strokeWidth={CONTROL_POINT_INDICATOR_STROKE_WIDTH} />
                          <line x1={-1} y1={-1 - MARKER_EDITING_CROSS_RADIUS} x2={-1} y2={-1 + MARKER_EDITING_CROSS_RADIUS} style={{ stroke: 'var(--marker-constraint-stroke)' }} strokeWidth={CONTROL_POINT_INDICATOR_STROKE_WIDTH} />
                        </g>
                      </g>
                    ))}
                </svg>
              )}
            </section>
            <hr className="vr" />
            <aside>
              {(Object.keys(markers) as StepsType[])
                .map((step) => {
                  const Configuration = markerConfigurationComponents[step][state.active[step] as string];
                  const disabled = Object.entries(state.active).some(([activeStep, activeOption]) => (disabledStepCombinations as any)[activeStep]?.[activeOption]?.includes(step));
                  return (
                    <Fragment key={step}>
                      <details
                        name="marker-editor-step"
                        aria-hidden={disabled || undefined}
                        title={disabled ? "This step is disabled because it's not compatible with some selected options" : undefined}
                        open={state.step === step}
                        onClick={(e) => {
                          if (disabled) e.preventDefault();
                        }}
                        onToggle={(e) => {
                          if (disabled && (e.nativeEvent as ToggleEvent).newState === 'open') {
                            e.currentTarget.open = false;
                          } else if ((e.nativeEvent as ToggleEvent).newState === 'open' && state.step !== step) {
                            setState((prev) => ({ ...prev, step }));
                          } else if ((e.nativeEvent as ToggleEvent).newState === 'closed' && state.step === step) {
                            e.currentTarget.open = true;
                          }
                        }}
                      >
                        <summary data-demo-target={`editor:step:${step}`} inert={disabled || undefined}>{_startCase(step)}</summary>
                        <ul role="listbox" aria-label={_startCase(step)}>
                          {Object.entries(markers[step])
                            .map(([type, part]) => {
                              const Thumbnail = markerThumbnailComponents[step][type];
                              return (
                                <li
                                  key={type}
                                  role="option"
                                  aria-label={part.title}
                                  aria-selected={state.active[step] === type}
                                  data-demo-target={`editor:${step}:${type}`}
                                  tabIndex={state.active[step] === type ? 0 : -1}
                                  onClick={() => setState((prev) => ({ ...prev, active: { ...prev.active, [step]: type as any } }))}
                                  onKeyDown={onOptionKey}
                                  title={part.title}
                                >
                                  <Thumbnail space={space} />
                                </li>
                              );
                            })
                          }
                        </ul>
  
                        <section className="marker-step-configuration">
                          <Configuration
                            space={space}
                          />
                        </section>
                      </details>
                      {disabled && <p className="sr-only">{_startCase(step)}. This step is disabled because it's not compatible with some selected options</p>}
                    </Fragment>
                  );
                }
                )}
            </aside>
          </article>
        </div>
      </div>
  );

  if (embed) return editor;

  // Portal into the carousel page — avoid <dialog>/showModal (viewport top-layer + focus scroll).
  return createPortal(editor, portalHost!);
}
