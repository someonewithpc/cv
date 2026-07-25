import '../client-only';

import { faArrowRotateLeft, faArrowRightFromBracket } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { createPortal } from 'react-dom';
import { v4 as uuidv4 } from 'uuid';
import cx from 'classnames';
import _startCase from 'lodash/startCase';

import { useRect } from '../../hooks/useRect';
import { mapRange } from '../../lib/mapRange';
import { addMarker, dataUrlToSvg, groupedUndo, markersSelector, setSpaceMarker, spacesSelector, updateMarker, useAppDispatch, useAppSelector } from '@/store';
import type { MarkerType, SpaceType } from '@/store';
import { useRootElementEvents } from '../../hooks/useRootElementEvents';

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

import './MarkerEditor.scss';

const MARKER_EDITING_CIRCLE_RADIUS = 0.0375;
const MARKER_EDITING_CROSS_RADIUS = 0.0625;
const CONTROL_POINT_INDICATOR_STROKE_WIDTH = 0.00625;

export const defaultActiveState = { shape: 'teardrop', decoration: 'customIcon', shapeBorder: 'solid', shapeBorderColor: 'solid', decorationBorder: 'none', decorationBorderColor: 'solid', shapeFill: 'solid', decorationFill: 'solid', decorationFont: 'font' } as const;

function resetAllMarkerParts() {
  Object.values(markers).forEach((step) => {
    Object.values(step).forEach((part) => {
      part.reset();
    });
  });
}

export function MarkerEditor({ space, baseMarkerId, isNewMarker, onClose }: { space: SpaceType, baseMarkerId: MarkerType['baseMarkerId'], isNewMarker: boolean, onClose: () => void }) {
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

  // Marker parts are process-wide singletons — reset + reload whenever this editor session changes,
  // otherwise leftover geometry/text from the previous marker leaks into the next edit.
  useLayoutEffect(() => {
    resetAllMarkerParts();
    const sourceMarker = isNewMarker
      ? undefined
      : (storeMarkers.find((m) => m.id === baseMarkerId) ?? storeMarkers.find((m) => m.id === space.markerId));
    const active = deserializeMarker(sourceMarker) ?? {};
    setState({
      active: { ...defaultActiveState, ...active },
      step: 'shape',
      draggedControlPoint: undefined,
      snappingDisabled: false,
      previousDecorationSnapCenter: null,
    });
    // Only re-seed when the edited marker identity changes — not on every store update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [space.markerId, isNewMarker, baseMarkerId]);

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
    ['keydown', 'keyup'],
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

  // Portal to document.body so overflow:hidden on the map demo cannot clip the editor.
  return createPortal(
    (
      <dialog
        open
        id="marker-editor"
        onKeyDown={(e) => e.stopPropagation()}
        onCancel={(e) => {
          e.preventDefault();
          onClose();
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
                  color="white"
                />
              </button>
              <button type="button" title="Reset" onClick={reset}>
                <FontAwesomeIcon
                  icon={faArrowRotateLeft}
                  color="white"
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
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            setState((prev) => ({ ...prev, draggedControlPoint: controlPointName as any }));
                          }}
                        >
                          {/* We position the indicators on the top left and use CSS `translate` to move them to the appropriate place in order to bypass React's rendering, as it was unusably slow */}
                          <circle cx={-1} cy={-1} r={MARKER_EDITING_CIRCLE_RADIUS} stroke="blue" fill="white" strokeWidth={CONTROL_POINT_INDICATOR_STROKE_WIDTH} />
                        </g>
                        <g
                          ref={activeControlPointIndicatorRefs[controlPointName]['constrained']}
                          style={{
                            pointerEvents: 'none',
                            translate: activePart.controlPoints[controlPointName].toCSSTranslate(),
                          }}
                        >
                          <line x1={-1 - MARKER_EDITING_CROSS_RADIUS} y1={-1} x2={-1 + MARKER_EDITING_CROSS_RADIUS} y2={-1} stroke="green" strokeWidth={CONTROL_POINT_INDICATOR_STROKE_WIDTH} />
                          <line x1={-1} y1={-1 - MARKER_EDITING_CROSS_RADIUS} x2={-1} y2={-1 + MARKER_EDITING_CROSS_RADIUS} stroke="green" strokeWidth={CONTROL_POINT_INDICATOR_STROKE_WIDTH} />
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
                    <details
                      key={step}
                      name="marker-editor-step"
                      className={cx({ disabled })}
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
                      <summary data-demo-target={`editor:step:${step}`}>{_startCase(step)}</summary>
                      <ul role="listbox">
                        {Object.entries(markers[step])
                          .map(([type, part]) => {
                            const Thumbnail = markerThumbnailComponents[step][type];
                            return (
                              <li
                                key={type}
                                role="option"
                                aria-selected={state.active[step] === type}
                                data-demo-target={`editor:${step}:${type}`}
                                onClick={() => setState((prev) => ({ ...prev, active: { ...prev.active, [step]: type as any } }))}
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
                  );
                }
                )}
            </aside>
          </article>
        </div>
      </dialog>
    ),
    document.body,
  );
}
