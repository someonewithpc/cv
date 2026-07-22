import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux';
import undoable, { includeAction } from 'redux-undo';

import { groupedUndo } from './groupedUndo';
import { markersSlice } from './modules/markers';
import { spacesSlice } from './modules/spaces';
import { uiSlice } from './modules/ui';

export type { MarkerDecorationType, MarkerType, SpaceType } from './types';
export { groupedUndo } from './groupedUndo';
export { assignSpaceMarker } from './assignSpaceMarker';

export {
  addMarker,
  removeMarker,
  removeMarkers,
  updateMarker,
  addDecoration,
  setDecorations,
  updateDecoration,
  scaleMarker,
  markersSelector,
  markerDecorationsSelector,
  firstMarkerIdSelector,
  mapSpaceToMarkerSelector,
  dataUrlToSvg,
  svgToDataUrl,
  defaultMarker,
  defaultMarkerDecoration,
  BASE_MARKER_ID,
  isBaseMarker,
  isMarkerInUse,
  unusedDerivedMarkerIds,
} from './modules/markers';

export {
  setMarkerEditingSpaceId,
  setAutoplayPaused,
  markerEditingSpaceIdSelector,
  autoplayPausedSelector,
  markerEditingSpaceSelector,
  externalFontFaceDeclarationsSelector,
} from './modules/ui';

export {
  setSpaceMarker,
  setSpaces,
  spacesSelector,
  spaceByIdSelector,
  spaceGlobalOrderSelector,
} from './modules/spaces';

const undoableActions = [
  'spaces/setMarker',
  'markers/add',
  'markers/update',
  'markers/remove',
  'markers/removeMany',
  'markers/addDecoration',
  'markers/setDecorations',
  'markers/scaleMarker',
];

const rootReducer = combineReducers({
  undoable: undoable(
    combineReducers({
      markers: markersSlice.reducer,
      spaces: spacesSlice.reducer,
    }),
    {
      filter: includeAction(undoableActions),
      syncFilter: true,
      groupBy: groupedUndo.init([]),
    },
  ),
  ui: uiSlice.reducer,
});

export type RootState = ReturnType<typeof rootReducer>;

export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) => getDefaultMiddleware({
    serializableCheck: false,
  }),
});

export type AppDispatch = typeof store.dispatch;

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

export default store;
