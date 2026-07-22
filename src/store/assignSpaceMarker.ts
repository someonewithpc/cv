import {
  isBaseMarker,
  isMarkerInUse,
  markersSelector,
  removeMarker,
  type MarkersRoot,
} from './modules/markers';
import { setSpaceMarker, spacesSelector } from './modules/spaces';
import type { MarkerType, SpaceType } from './types';

type AssignDispatch = (action: unknown) => unknown;

type AssignRoot = MarkersRoot & {
  undoable: {
    present: {
      spaces: { list: SpaceType[] };
    };
  };
};

/**
 * Assign `markerId` to a space. If the previous marker is a derived copy and
 * becomes unused, remove it. Never creates a marker — callers must reuse or add.
 */
export function assignSpaceMarker(
  dispatch: AssignDispatch,
  getState: () => AssignRoot,
  spaceId: SpaceType['id'],
  markerId: MarkerType['id'],
) {
  const state = getState();
  const spaces = spacesSelector(state);
  const markers = markersSelector(state);
  const space = spaces.find((s) => s.id === spaceId);
  const previousId = space?.markerId;

  if (previousId === markerId) return;

  dispatch(setSpaceMarker({ spaceId, markerId }));

  if (previousId === undefined) return;

  const previous = markers.find((marker) => marker.id === previousId);
  if (!previous || isBaseMarker(previous)) return;

  if (!isMarkerInUse(previousId, spaces, spaceId)) {
    dispatch(removeMarker(previousId));
  }
}
