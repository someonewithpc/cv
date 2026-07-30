import '../client-only';

import { useState } from 'react';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCopy, faPencil, faPlus, faTrash, faUpload, faXmark } from '@fortawesome/free-solid-svg-icons';
import { v4 as uuidv4 } from 'uuid';
import cx from 'classnames';

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
} from '@/store';

import { MarkerEditor } from '../MarkerEditor';
import { resolveMarkerSvgForSpace } from '../resolveMarkerSvgForSpace';

import { InlineSVG } from './InlineSVG';
import { SelectedMarkerPreview } from './SelectedMarkerPreview';

import './MarkerSelector.scss';

type Position = { x: number; y: number };

export function MarkerSelector({
  space,
  position,
  onClose,
  portalHost,
}: {
  space: SpaceType;
  position: Position;
  onClose: () => void;
  portalHost: HTMLElement | null;
}) {
  const dispatch = useAppDispatch();
  const markers = useAppSelector(markersSelector);
  const mapSpaceToMarker = useAppSelector(mapSpaceToMarkerSelector);
  const currentMarker = mapSpaceToMarker(space);
  const allSpaces = useAppSelector(spacesSelector);

  const [editedMarkerId, setEditedMarkerId] = useState<MarkerType['id'] | undefined>(undefined);
  const [editedBaseMarkerId, setEditedBaseMarkerId] = useState<MarkerType['baseMarkerId']>(undefined);
  const [isNewMarker, setIsNewMarker] = useState(false);

  if (editedMarkerId) {
    return (
      <MarkerEditor
        space={{ ...space, markerId: editedMarkerId }}
        baseMarkerId={editedBaseMarkerId}
        isNewMarker={isNewMarker}
        portalHost={portalHost}
        onClose={() => {
          setEditedMarkerId(undefined);
          setEditedBaseMarkerId(undefined);
          setIsNewMarker(false);
        }}
      />
    );
  }

  return (
    <>
      <section
        className="marker-editing-overlay"
        style={{
          position: 'absolute',
          left: `${position.x}%`,
          top: `${position.y}%`,
          translate: '-50% calc(-100% - 4rem)',
          zIndex: 20,
        }}
      >
        <ul role="listbox" aria-label="Markers">
          {markers.map((marker) => {
            const deleteDisabled = allSpaces.some((s) => (s.id === space.id) !== (s.markerId === marker.id));

            return (
              <li
                key={marker.id}
                role="option"
                aria-label={`Marker ${marker.id}`}
                aria-selected={marker.id === currentMarker.id}
                data-demo-target={`selector:marker:${marker.id}`}
                style={{ position: 'relative' }}
                onClick={() => {
                  groupedUndo.batch(() => {
                    if (space.markerId !== marker.id) {
                      dispatch(setSpaceMarker({ spaceId: space.id, markerId: marker.id }));

                      if (space.markerId !== undefined && !deleteDisabled) {
                        dispatch(removeMarker(space.markerId));
                        dispatch(setSpaceMarker({ spaceId: space.id, markerId: undefined }));
                      }
                    }
                    setEditedMarkerId(undefined);
                  });
                  onClose();
                }}
              >
                {marker.resolvedSource === undefined
                  ? <img src={marker.source} alt="" />
                  : <InlineSVG svgString={resolveMarkerSvgForSpace(marker.resolvedSource, space)} />}
                {marker.kind === 'editor' && (
                  <>
                    <span
                      className="marker-edit-icon"
                      data-demo-target={`selector:edit:${marker.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditedMarkerId(marker.id);
                        setEditedBaseMarkerId(marker.baseMarkerId);
                        setIsNewMarker(false);
                      }}
                    >
                      <FontAwesomeIcon icon={faPencil} />
                    </span>
                    <span
                      className={cx('marker-duplicate-icon', { disabled: !deleteDisabled })}
                      title="Duplicate marker"
                      onClick={(e) => {
                        e.stopPropagation();
                        groupedUndo.batch(() => {
                          const newMarkerId = uuidv4();
                          dispatch(addMarker({
                            ...marker,
                            id: newMarkerId,
                          }));
                          dispatch(setSpaceMarker({ spaceId: space.id, markerId: newMarkerId }));
                          if (space.markerId !== undefined && !deleteDisabled) {
                            dispatch(removeMarker(space.markerId));
                          }

                          setEditedMarkerId(newMarkerId);
                        });
                      }}
                    >
                      <FontAwesomeIcon icon={faCopy} />
                    </span>
                    <span
                      className={cx('marker-delete-icon', { disabled: deleteDisabled })}
                      title={deleteDisabled
                        ? 'Cannot delete marker: marker is being used'
                        : 'Delete marker'}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!deleteDisabled) {
                          dispatch(removeMarker(marker.id));
                          dispatch(setSpaceMarker({ spaceId: space.id, markerId: undefined }));
                          setEditedMarkerId(undefined);
                        }
                      }}
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </span>
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
            onClick={() => {
              setEditedMarkerId(uuidv4());
              setIsNewMarker(true);
            }}
          >
            <FontAwesomeIcon icon={faPlus} size="3x" color="white" />
          </li>
          <li
            role="option"
            aria-selected={false}
            aria-disabled="true"
            aria-label="Uploading is not available in this demo"
            title="Uploading is not available in this demo"
            className="marker-uploader disabled"
          >
            <FontAwesomeIcon icon={faUpload} size="3x" />
          </li>
          <li
            role="option"
            aria-selected={false}
            aria-label="Close marker selector"
            data-demo-target="selector:close"
            onClick={onClose}
            title="Close marker selector"
          >
            <FontAwesomeIcon icon={faXmark} size="3x" color="white" />
          </li>
        </ul>
      </section>
      <SelectedMarkerPreview space={space} position={position} />
    </>
  );
}
