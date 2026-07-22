import { createSelector, createSlice } from '@reduxjs/toolkit';

import defaultMarkerSVG from '@/components/MarkerEditorDemo/assets/default-marker.svg?raw';
import defaultDecorationSVG from '@/components/MarkerEditorDemo/assets/default-decoration.svg?raw';

import { type MarkerDecorationType, type MarkerType, type SpaceType } from '../types';

type MarkersRoot = {
  undoable: {
    present: {
      markers: MarkersState;
    };
  };
};

export type { MarkersRoot };

export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

export function dataUrlToSvg(dataUrl: string): string {
  if (dataUrl.startsWith('data:image/svg+xml;base64,')) {
    const base64Data = dataUrl.replace(/^data:image\/svg\+xml;base64,/, '');
    return atob(base64Data);
  }
  if (dataUrl.startsWith('data:image/svg+xml,')) {
    return decodeURIComponent(dataUrl.replace(/^data:image\/svg\+xml,/, ''));
  }
  throw new Error('Invalid SVG data URL format');
}

function resolveSource(source: string): string | undefined {
  try {
    if (source.startsWith('data:')) {
      return dataUrlToSvg(source);
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export const BASE_MARKER_ID = 'default' as const;

export const defaultMarker: MarkerType = {
  id: BASE_MARKER_ID,
  baseMarkerId: null,
  source: svgToDataUrl(defaultMarkerSVG),
  resolvedSource: defaultMarkerSVG,
  size: [57, 57],
  anchor: [57 / 2, 57],
  popupAnchor: [0, 57 * -0.70],
  kind: 'upload',
};

/** Main library markers stay; derived/shared copies (`baseMarkerId` set) can be GC'd. */
export function isBaseMarker(marker: MarkerType): boolean {
  return marker.id === BASE_MARKER_ID || marker.baseMarkerId == null;
}

export function isMarkerInUse(
  markerId: MarkerType['id'],
  spaces: SpaceType[],
  exceptSpaceId?: SpaceType['id'],
): boolean {
  return spaces.some((space) => (
    space.markerId === markerId && space.id !== exceptSpaceId
  ));
}

/** Derived markers that no space references anymore. */
export function unusedDerivedMarkerIds(
  markers: MarkerType[],
  spaces: SpaceType[],
  exceptSpaceId?: SpaceType['id'],
): MarkerType['id'][] {
  const used = new Set(
    spaces
      .filter((space) => space.id !== exceptSpaceId)
      .map((space) => space.markerId)
      .filter((id): id is MarkerType['id'] => id !== undefined),
  );

  return markers
    .filter((marker) => !isBaseMarker(marker) && !used.has(marker.id))
    .map((marker) => marker.id);
}

export const defaultMarkerDecoration: MarkerDecorationType = {
  id: 'default',
  source: svgToDataUrl(defaultDecorationSVG),
  resolvedSource: defaultDecorationSVG,
  filename: null,
};

type MarkersState = {
  list: MarkerType[];
  decorations: MarkerDecorationType[];
};

function updateReducer(state: MarkersState, { payload }: { payload: Partial<MarkerType> }): MarkersState {
  const nextPayload = { ...payload };
  if (payload.source !== undefined && payload.resolvedSource === undefined) {
    nextPayload.resolvedSource = resolveSource(payload.source);
  }
  return {
    ...state,
    list: state.list.map((marker) => (
      marker.id === payload.id
        ? { ...marker, ...nextPayload }
        : marker
    )),
  };
}

function updateDecorationReducer(state: MarkersState, { payload }: { payload: Partial<MarkerDecorationType> }): MarkersState {
  const nextPayload = { ...payload };
  if (payload.source !== undefined && payload.resolvedSource === undefined) {
    nextPayload.resolvedSource = resolveSource(payload.source);
  }
  return {
    ...state,
    decorations: state.decorations.map((decoration) => (
      decoration.id === payload.id
        ? { ...decoration, ...nextPayload }
        : decoration
    )),
  };
}

export const markersSlice = createSlice({
  name: 'markers',
  initialState: {
    list: [defaultMarker],
    decorations: [defaultMarkerDecoration],
  } as MarkersState,
  reducers: {
    add: (state, { payload }: { payload: Partial<MarkerType> & Pick<MarkerType, 'id'> }) => {
      const source = payload.source ?? defaultMarker.source;
      return {
        ...state,
        list: [
          ...state.list,
          {
            ...defaultMarker,
            ...payload,
            source,
            resolvedSource: payload.resolvedSource ?? resolveSource(source) ?? defaultMarker.resolvedSource,
          },
        ],
      };
    },
    remove: (state, { payload }: { payload: MarkerType['id'] }) => (
      { ...state, list: state.list.filter((marker) => marker.id !== payload) }
    ),
    removeMany: (state, { payload }: { payload: MarkerType['id'][] }) => {
      if (payload.length === 0) return state;
      const removeIds = new Set(payload);
      return {
        ...state,
        list: state.list.filter((marker) => !removeIds.has(marker.id)),
      };
    },
    scaleMarker: (state, { payload: { id, scale } }: { payload: { id: MarkerType['id']; scale: number | [number, number] } }) => (
      {
        ...state,
        list: state.list.map((marker) => (
          id === marker.id
            ? {
              ...marker,
              size: [marker.size[0] * (Array.isArray(scale) ? scale[0] : scale), marker.size[1] * (Array.isArray(scale) ? scale[1] : scale)] as [number, number],
              anchor: [marker.anchor[0] * (Array.isArray(scale) ? scale[0] : scale), marker.anchor[1] * (Array.isArray(scale) ? scale[1] : scale)] as [number, number],
              popupAnchor: [marker.popupAnchor[0] * (Array.isArray(scale) ? scale[0] : scale), marker.popupAnchor[1] * (Array.isArray(scale) ? scale[1] : scale)] as [number, number],
            }
            : marker
        )),
      }
    ),
    update: updateReducer,
    addDecoration: (state, { payload }: { payload: MarkerDecorationType }) => (
      {
        ...state,
        decorations: [
          ...state.decorations,
          {
            ...payload,
            resolvedSource: payload.resolvedSource ?? resolveSource(payload.source),
          },
        ],
      }
    ),
    setDecorations: (state, { payload }: { payload: MarkerDecorationType[] }) => (
      { ...state, decorations: payload }
    ),
    updateDecoration: updateDecorationReducer,
  },
});

const {
  add, remove, removeMany, update, addDecoration, setDecorations, scaleMarker, updateDecoration,
} = markersSlice.actions;

export {
  add as addMarker,
  remove as removeMarker,
  removeMany as removeMarkers,
  update as updateMarker,
  addDecoration,
  setDecorations,
  updateDecoration,
  scaleMarker,
};

export const markersSelector = (state: MarkersRoot) => state.undoable.present.markers.list;
export const markerDecorationsSelector = (state: MarkersRoot) => state.undoable.present.markers.decorations;

export const firstMarkerIdSelector = createSelector(
  markersSelector,
  (markers) => markers[0]?.id ?? 'default',
);

export const mapSpaceToMarkerSelector = createSelector(
  markersSelector,
  (markers) => (space: SpaceType | undefined) =>
    markers.find((marker) => marker.id === space?.markerId) ?? markers[0],
);
