import '../client-only';

import { useState } from 'react';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCopy, faPencil, faPlus, faTrash, faXmark } from '@fortawesome/free-solid-svg-icons';
import { v4 as uuidv4 } from 'uuid';
import cx from 'classnames';

import store, {
  addMarker,
  assignSpaceMarker,
  groupedUndo,
  isBaseMarker,
  isMarkerInUse,
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

import { MarkerUploader } from './MarkerUploader';
import { InlineSVG } from './InlineSVG';
import { SelectedMarkerPreview } from './SelectedMarkerPreview';

import './MarkerSelector.scss';

type Position = { x: number; y: number };

export function MarkerSelector({
  space,
  position,
  onClose,
}: {
  space: SpaceType;
  position: Position;
  onClose: () => void;
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
        <ul role="listbox">
          {markers.map((marker) => {
            const usedElsewhere = isMarkerInUse(marker.id, allSpaces, space.id);
            const deleteDisabled = usedElsewhere || isBaseMarker(marker);

            return (
              <li
                key={marker.id}
                role="option"
                aria-selected={marker.id === currentMarker.id}
                style={{ position: 'relative' }}
                onClick={() => {
                  groupedUndo.batch(() => {
                    // Reuse the clicked marker — never add a duplicate on select.
                    assignSpaceMarker(dispatch, store.getState, space.id, marker.id);
                  });
                  setEditedMarkerId(undefined);
                  onClose();
                }}
              >
                {marker.resolvedSource === undefined
                  ? <img src={marker.source} alt="" />
                  : <InlineSVG svgString={marker.resolvedSource} />}
                {marker.kind === 'editor' && (
                  <>
                    <FontAwesomeIcon
                      icon={faPencil}
                      className="marker-edit-icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditedMarkerId(marker.id);
                        setEditedBaseMarkerId(marker.baseMarkerId);
                        setIsNewMarker(false);
                      }}
                    />
                    <FontAwesomeIcon
                      icon={faCopy}
                      className={cx('marker-duplicate-icon', { disabled: !usedElsewhere && !isBaseMarker(marker) })}
                      title="Duplicate marker"
                      onClick={(e) => {
                        e.stopPropagation();
                        // Only fork when the marker is shared/base — exclusive copies edit in place.
                        if (!usedElsewhere && !isBaseMarker(marker)) return;

                        groupedUndo.batch(() => {
                          const newMarkerId = uuidv4();
                          dispatch(addMarker({
                            ...marker,
                            id: newMarkerId,
                            baseMarkerId: marker.baseMarkerId ?? String(marker.id),
                          }));
                          assignSpaceMarker(dispatch, store.getState, space.id, newMarkerId);
                          setEditedMarkerId(newMarkerId);
                        });
                      }}
                    />
                    <FontAwesomeIcon
                      icon={faTrash}
                      className={cx('marker-delete-icon', { disabled: deleteDisabled })}
                      title={deleteDisabled
                        ? (isBaseMarker(marker)
                          ? 'Cannot delete the base marker'
                          : 'Cannot delete marker: marker is being used')
                        : 'Delete marker'}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (deleteDisabled) return;

                        groupedUndo.batch(() => {
                          dispatch(removeMarker(marker.id));
                          if (space.markerId === marker.id) {
                            dispatch(setSpaceMarker({ spaceId: space.id, markerId: undefined }));
                          }
                          setEditedMarkerId(undefined);
                        });
                      }}
                    />
                  </>
                )}
              </li>
            );
          })}
          <MarkerUploader space={space} onUploadComplete={onClose} />
          <li
            role="option"
            aria-selected={false}
            title="Create new marker"
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
