import '../client-only';

import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCopy, faPencil, faPlus, faTrash, faUpload, faXmark } from '@fortawesome/free-solid-svg-icons';
import { v4 as uuidv4 } from 'uuid';

import {
  addMarker,
  groupedUndo,
  mapSpaceToMarkerSelector,
  markersSelector,
  removeMarker,
  setSpaceMarker,
  spacesSelector,
  useAppDispatch,
  useAppSelector,
  type MarkerType,
  type SpaceType,
} from '../../store';

import { resolveMarkerSvgForSpace } from '../resolveMarkerSvgForSpace';

import { InlineSVG } from './InlineSVG';
import { SelectedMarkerPreview } from './SelectedMarkerPreview';

import './MarkerSelector.scss';

/**
 * The keyboard half of an option that is a list item with a click handler: a stop for Tab,
 * and Enter or Space doing what the click does. The item stays the element the click, the
 * demo cursor and the specs all aim at.
 */
function pressable(onPress: () => void) {
  return {
    tabIndex: 0,
    onClick: onPress,
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      // Keys from the Edit, Duplicate and Delete buttons inside the option bubble up here.
      if (event.target !== event.currentTarget) return;
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      onPress();
    },
  };
}


const MarkerEditor = lazy(async () => {
  const mod = await import('../MarkerEditor');
  return { default: mod.MarkerEditor };
});

type Position = { x: number; y: number };

export function MarkerSelector({
  space,
  position,
  onClose,
  portalHost,
  interactive = false,
  focusOnOpen = false,
}: {
  space: SpaceType;
  position: Position;
  onClose: () => void;
  portalHost: HTMLElement | null;
  /** The visitor has the demo: an open moves focus into the editor, a close gives it back. */
  interactive?: boolean;
  /** Opened from the keyboard: focus starts on the space's current marker. */
  focusOnOpen?: boolean;
}) {
  const dispatch = useAppDispatch();
  const markers = useAppSelector(markersSelector);
  const mapSpaceToMarker = useAppSelector(mapSpaceToMarkerSelector);
  const currentMarker = mapSpaceToMarker(space);
  const allSpaces = useAppSelector(spacesSelector);

  const [editedMarkerId, setEditedMarkerId] = useState<MarkerType['id'] | undefined>(undefined);
  const [editedBaseMarkerId, setEditedBaseMarkerId] = useState<MarkerType['baseMarkerId']>(undefined);
  const [isNewMarker, setIsNewMarker] = useState(false);

  // The option the visitor opened the editor from, as its demo target; the walkthrough's
  // opens leave it unset and focus alone.
  const [opener, setOpener] = useState<string | null>(null);
  const listRef = useRef<HTMLElement>(null);
  const openEditor = (target: string) => setOpener(interactive ? target : null);

  useEffect(() => {
    if (editedMarkerId !== undefined || opener === null) return;
    setOpener(null);
    listRef.current?.querySelector<HTMLElement>(`[data-demo-target="${opener}"]`)?.focus({ preventScroll: true });
  }, [editedMarkerId, opener]);

  useEffect(() => {
    if (!focusOnOpen) return;
    listRef.current?.querySelector<HTMLElement>('[role="option"][aria-selected="true"]')?.focus({ preventScroll: true });
  // On open only: a pick closes the selector, and the editor hands focus back itself.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One object per space and marker: a literal here was a new prop on every render, and the
  // editor re-runs its nine imperative roots whenever the space it is handed changes.
  const editedSpace = useMemo(() => ({ ...space, markerId: editedMarkerId }), [space, editedMarkerId]);

  if (editedMarkerId) {
    return (
      <Suspense fallback={null}>
        <MarkerEditor
          space={editedSpace}
          baseMarkerId={editedBaseMarkerId}
          isNewMarker={isNewMarker}
          portalHost={portalHost}
          focusOnOpen={opener !== null}
          onClose={() => {
            setEditedMarkerId(undefined);
            setEditedBaseMarkerId(undefined);
            setIsNewMarker(false);
          }}
        />
      </Suspense>
    );
  }

  return (
    <>
      <section
        ref={listRef}
        className="marker-editing-overlay"
        style={{
          '--selector-anchor-x': `${position.x}%`,
          '--selector-anchor-y': `${position.y}%`,
        } as CSSProperties}
      >
        <ul role="listbox" aria-label="Markers">
          {markers.map((marker) => {
            // A marker is in use when a space other than this one carries it. This space's own
            // choice is not a reason to keep the marker: picking another one, or deleting this
            // one, is what the space is here to do.
            const usedElsewhere = (markerId: typeof marker.id) => allSpaces.some((s) => s.id !== space.id && s.markerId === markerId);
            const deleteDisabled = usedElsewhere(marker.id);

            return (
              <li
                key={marker.id}
                role="option"
                aria-label={`Marker ${marker.id}`}
                aria-selected={marker.id === currentMarker.id}
                data-demo-target={`selector:marker:${marker.id}`}
                style={{ position: 'relative' }}
                {...pressable(() => {
                  groupedUndo.batch(() => {
                    if (space.markerId !== marker.id) {
                      // The marker this space is leaving goes with it unless another space
                      // still shows it; a marker nobody shows has no way back to the map. Only
                      // markers made in the editor go: the built-in `default` has no delete
                      // button, and the walkthrough's reset points every space back at it.
                      const previous = space.markerId;
                      const previousKind = markers.find((m) => m.id === previous)?.kind;
                      dispatch(setSpaceMarker({ spaceId: space.id, markerId: marker.id }));

                      if (previous !== undefined && previousKind === 'editor' && !usedElsewhere(previous)) {
                        dispatch(removeMarker(previous));
                      }
                    }
                    setEditedMarkerId(undefined);
                  });
                  onClose();
                })}
              >
                {marker.resolvedSource === undefined
                  ? <img src={marker.source} alt="" />
                  : <InlineSVG svgString={resolveMarkerSvgForSpace(marker.resolvedSource, space)} />}
                {marker.kind === 'editor' && (
                  <>
                    <button
                      type="button"
                      className="marker-edit-icon"
                      data-demo-target={`selector:edit:${marker.id}`}
                      title="Edit marker"
                      aria-label="Edit marker"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditor(`selector:edit:${marker.id}`);
                        setEditedMarkerId(marker.id);
                        setEditedBaseMarkerId(marker.baseMarkerId);
                        setIsNewMarker(false);
                      }}
                    >
                      <FontAwesomeIcon icon={faPencil} />
                    </button>
                    <button
                      type="button"
                      className="marker-duplicate-icon"
                      title="Duplicate marker"
                      aria-label="Duplicate marker"
                      onClick={(e) => {
                        e.stopPropagation();
                        groupedUndo.batch(() => {
                          const newMarkerId = uuidv4();
                          dispatch(addMarker({
                            ...marker,
                            id: newMarkerId,
                          }));
                          dispatch(setSpaceMarker({ spaceId: space.id, markerId: newMarkerId }));
                          if (space.markerId === marker.id && !deleteDisabled) {
                            dispatch(removeMarker(marker.id));
                          }

                          setEditedMarkerId(newMarkerId);
                        });
                      }}
                    >
                      <FontAwesomeIcon icon={faCopy} />
                    </button>
                    <button
                      type="button"
                      className="marker-delete-icon"
                      disabled={deleteDisabled}
                      title={deleteDisabled
                        ? 'Cannot delete marker: marker is being used'
                        : 'Delete marker'}
                      aria-label={deleteDisabled
                        ? 'Cannot delete marker: marker is being used'
                        : 'Delete marker'}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!deleteDisabled) {
                          // One undo step for the one click, as the other handlers here do.
                          groupedUndo.batch(() => {
                            dispatch(removeMarker(marker.id));
                            if (space.markerId === marker.id) {
                              dispatch(setSpaceMarker({ spaceId: space.id, markerId: undefined }));
                            }
                          });
                          setEditedMarkerId(undefined);
                        }
                      }}
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  </>
                )}
              </li>
            );
          })}
          <li
            role="option"
            aria-selected={false}
            aria-label="Create new marker"
            title="Create new marker"
            data-demo-target="selector:create"
            {...pressable(() => {
              openEditor('selector:create');
              setEditedMarkerId(uuidv4());
              setIsNewMarker(true);
            })}
          >
            <FontAwesomeIcon icon={faPlus} size="3x" color="var(--marker-chrome-icon)" />
          </li>
          <li
            role="option"
            aria-selected={false}
            aria-disabled="true"
            aria-label="Uploading is not available in this demo"
            title="Uploading is not available in this demo"
            className="marker-uploader"
          >
            <FontAwesomeIcon icon={faUpload} size="3x" />
          </li>
          <li
            role="option"
            aria-selected={false}
            aria-label="Close marker selector"
            data-demo-target="selector:close"
            {...pressable(onClose)}
            title="Close marker selector"
          >
            <FontAwesomeIcon icon={faXmark} size="3x" color="var(--marker-chrome-icon)" />
          </li>
        </ul>
      </section>
      <SelectedMarkerPreview space={space} position={position} />
    </>
  );
}
