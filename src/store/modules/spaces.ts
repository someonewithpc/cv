import { createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { type MarkerType, type SpaceType } from '../types';

type SpacesState = {
  list: SpaceType[];
};

type SpacesRoot = {
  undoable: {
    present: {
      spaces: SpacesState;
    };
  };
};

const initialSpaces: SpaceType[] = [
  { id: 'space-lobby', name: 'Lobby', markerId: 'default', x: 30, y: 40 },
  { id: 'space-cafe', name: 'Cafe', markerId: 'default', x: 55, y: 36 },
  { id: 'space-plaza', name: 'Plaza', markerId: 'default', x: 74, y: 68 },
];

export const spacesSlice = createSlice({
  name: 'spaces',
  initialState: {
    list: initialSpaces,
  } as SpacesState,
  reducers: {
    setMarker: (state, { payload }: PayloadAction<{ spaceId: SpaceType['id']; markerId: SpaceType['markerId'] }>) => {
      const space = state.list.find((s) => s.id === payload.spaceId);
      if (space) {
        space.markerId = payload.markerId;
      }
    },
    setSpaces: (state, { payload }: PayloadAction<SpaceType[]>) => {
      state.list = payload;
    },
  },
});

export const {
  setMarker,
  setSpaces,
} = spacesSlice.actions;

export { setMarker as setSpaceMarker };

export const spacesSelector = (state: SpacesRoot) => state.undoable.present.spaces.list;

export const spaceByIdSelector = (state: SpacesRoot, id: SpaceType['id'] | null) => (
  id === null ? undefined : state.undoable.present.spaces.list.find((s) => s.id === id)
);

export const spaceGlobalOrderSelector = createSelector(
  spacesSelector,
  (spaces) => Object.fromEntries(spaces.map((space, index) => [space.id, index])) as Record<string, number>,
);

export type { MarkerType };
