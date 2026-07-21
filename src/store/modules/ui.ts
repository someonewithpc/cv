import { createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { type SpaceType } from '../types';

import { spacesSelector } from './spaces';

type UiState = {
  markerEditingSpaceId: SpaceType['id'] | null;
  autoplayPaused: boolean;
};

type UiRoot = {
  ui: UiState;
  undoable: {
    present: {
      spaces: { list: SpaceType[] };
    };
  };
};

const initialState: UiState = {
  markerEditingSpaceId: null,
  autoplayPaused: false,
};

export const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setMarkerEditingSpaceId: (state, { payload }: PayloadAction<SpaceType['id'] | null>) => {
      state.markerEditingSpaceId = payload;
    },
    setAutoplayPaused: (state, { payload }: PayloadAction<boolean>) => {
      state.autoplayPaused = payload;
    },
  },
});

export const {
  setMarkerEditingSpaceId,
  setAutoplayPaused,
} = uiSlice.actions;

export const markerEditingSpaceIdSelector = (state: UiRoot) => state.ui.markerEditingSpaceId;
export const autoplayPausedSelector = (state: UiRoot) => state.ui.autoplayPaused;

export const markerEditingSpaceSelector = createSelector(
  [(state: UiRoot) => state.ui.markerEditingSpaceId, spacesSelector],
  (id, spaces) => (id === null ? undefined : spaces.find((s) => s.id === id)),
);

/** Demo stub — the CV demo does not load external @font-face rules from a map. */
export const externalFontFaceDeclarationsSelector = (_state?: unknown) => (
  {} as Record<string, string>
);
