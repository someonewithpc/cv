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

// btoa and atob take Latin-1 only, and the SVG carries whatever the visitor typed into a
// free-text decoration: outerHTML leaves a euro sign, an arrow or an emoji as it is, and
// btoa throws on the first code point past U+00FF. So the text goes through UTF-8 bytes
// in both directions.
const toBase64 = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)));
const fromBase64 = (base64: string) => new TextDecoder().decode(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)));

export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${toBase64(svg)}`;
}

export function dataUrlToSvg(dataUrl: string): string {
  if (dataUrl.startsWith('data:image/svg+xml;base64,')) {
    const base64Data = dataUrl.replace(/^data:image\/svg\+xml;base64,/, '');
    return fromBase64(base64Data);
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

export const defaultMarker: MarkerType = {
  id: 'default',
  baseMarkerId: null,
  source: svgToDataUrl(defaultMarkerSVG),
  resolvedSource: defaultMarkerSVG,
  size: [57, 57],
  anchor: [57 / 2, 57],
  popupAnchor: [0, 57 * -0.70],
  kind: 'upload',
};

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
  add, remove, update, addDecoration, setDecorations, scaleMarker, updateDecoration,
} = markersSlice.actions;

export {
  add as addMarker,
  remove as removeMarker,
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
