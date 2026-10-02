import { useSyncExternalStore } from 'react';
import { v4 as uuidv4 } from 'uuid';

import defaultMarkerSVG from './assets/default-marker.svg?raw';
import defaultDecorationSVG from './assets/default-decoration.svg?raw';

export type MarkerType = {
  id: string | number;
  baseMarkerId?: string | null;
  source: string;
  resolvedSource?: string;
  size: [number, number];
  anchor: [number, number];
  popupAnchor: [number, number];
  kind: 'upload' | 'editor';
  filename?: string | null;
};

export type MarkerDecorationType = {
  id: number | string;
  source: string;
  resolvedSource?: string;
  filename?: string | null;
};

export type SpaceType = {
  id: string;
  name: string;
  markerId?: MarkerType['id'];
  /** Position on the mock map, in viewBox coordinates (0–100). */
  x: number;
  y: number;
};

// btoa and atob take Latin-1 only, and the SVG carries whatever the visitor typed into a
// free-text decoration: outerHTML leaves a euro sign, an arrow or an emoji as it is, and
// btoa throws on the first code point past U+00FF. So the text goes through UTF-8 bytes
// in both directions.
const toBase64 = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  // Spreading, or apply, passes every byte as an argument, and engines cap those near 64k.
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};
const fromBase64 = (base64: string) => new TextDecoder().decode(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)));

export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${toBase64(svg)}`;
}

export function dataUrlToSvg(dataUrl: string): string {
  if (dataUrl.startsWith('data:image/svg+xml;base64,')) {
    return fromBase64(dataUrl.replace(/^data:image\/svg\+xml;base64,/, ''));
  }
  if (dataUrl.startsWith('data:image/svg+xml,')) {
    return decodeURIComponent(dataUrl.replace(/^data:image\/svg\+xml,/, ''));
  }
  throw new Error('Invalid SVG data URL format');
}

function resolveSource(source: string): string | undefined {
  try {
    if (source.startsWith('data:')) return dataUrlToSvg(source);
  } catch {
    return undefined;
  }
  return undefined;
}

const defaultMarker: MarkerType = {
  id: 'default',
  baseMarkerId: null,
  source: svgToDataUrl(defaultMarkerSVG),
  resolvedSource: defaultMarkerSVG,
  size: [57, 57],
  anchor: [57 / 2, 57],
  popupAnchor: [0, 57 * -0.70],
  kind: 'upload',
};

const defaultMarkerDecoration: MarkerDecorationType = {
  id: 'default',
  source: svgToDataUrl(defaultDecorationSVG),
  resolvedSource: defaultDecorationSVG,
  filename: null,
};

/** What undo and redo step through. */
type Doc = {
  markers: MarkerType[];
  decorations: MarkerDecorationType[];
  spaces: SpaceType[];
};

export type RootState = {
  past: Doc[];
  present: Doc;
  future: Doc[];
  /** The batch the last undo step came from, so the next action in it joins that step. */
  group: string | null;
  ui: { markerEditingSpaceId: SpaceType['id'] | null };
};

type Action =
  | { type: 'markers/add'; payload: Partial<MarkerType> & Pick<MarkerType, 'id'> }
  | { type: 'markers/update'; payload: Partial<MarkerType> }
  | { type: 'markers/remove'; payload: MarkerType['id'] }
  | { type: 'spaces/setMarker'; payload: { spaceId: SpaceType['id']; markerId: SpaceType['markerId'] } }
  | { type: 'spaces/set'; payload: SpaceType[] }
  | { type: 'ui/setMarkerEditingSpaceId'; payload: SpaceType['id'] | null }
  | { type: 'undo' | 'redo' | 'clearHistory' };

export const addMarker = (payload: Extract<Action, { type: 'markers/add' }>['payload']): Action => ({ type: 'markers/add', payload });
export const updateMarker = (payload: Partial<MarkerType>): Action => ({ type: 'markers/update', payload });
export const removeMarker = (payload: MarkerType['id']): Action => ({ type: 'markers/remove', payload });
export const setSpaceMarker = (payload: Extract<Action, { type: 'spaces/setMarker' }>['payload']): Action => ({ type: 'spaces/setMarker', payload });
export const setSpaces = (payload: SpaceType[]): Action => ({ type: 'spaces/set', payload });
export const setMarkerEditingSpaceId = (payload: SpaceType['id'] | null): Action => ({ type: 'ui/setMarkerEditingSpaceId', payload });
export const undo = (): Action => ({ type: 'undo' });
export const redo = (): Action => ({ type: 'redo' });
export const clearHistory = (): Action => ({ type: 'clearHistory' });

/** Replacing every space at once is a reset, not an edit, so it leaves the history alone. */
const notUndoable = new Set<Action['type']>(['spaces/set', 'ui/setMarkerEditingSpaceId']);

function docReducer(doc: Doc, action: Action): Doc {
  switch (action.type) {
    case 'markers/add': {
      const { payload } = action;
      const source = payload.source ?? defaultMarker.source;
      const resolvedSource = payload.resolvedSource ?? resolveSource(source) ?? defaultMarker.resolvedSource;
      return { ...doc, markers: [...doc.markers, { ...defaultMarker, ...payload, source, resolvedSource }] };
    }
    case 'markers/update': {
      const next = { ...action.payload };
      if (next.source !== undefined && next.resolvedSource === undefined) {
        next.resolvedSource = resolveSource(next.source);
      }
      return { ...doc, markers: doc.markers.map((m) => (m.id === next.id ? { ...m, ...next } : m)) };
    }
    case 'markers/remove':
      return { ...doc, markers: doc.markers.filter((m) => m.id !== action.payload) };
    case 'spaces/setMarker': {
      const { spaceId, markerId } = action.payload;
      const space = doc.spaces.find((s) => s.id === spaceId);
      if (!space || space.markerId === markerId) return doc;
      return { ...doc, spaces: doc.spaces.map((s) => (s === space ? { ...s, markerId } : s)) };
    }
    case 'spaces/set':
      return { ...doc, spaces: action.payload };
    default:
      return doc;
  }
}

function reducer(state: RootState, action: Action): RootState {
  const { past, present, future } = state;
  switch (action.type) {
    case 'undo':
      if (!past.length) return state;
      return { ...state, past: past.slice(0, -1), present: past[past.length - 1], future: [present, ...future], group: null };
    case 'redo':
      if (!future.length) return state;
      return { ...state, past: [...past, present], present: future[0], future: future.slice(1), group: null };
    case 'clearHistory':
      return { ...state, past: [], future: [], group: null };
    case 'ui/setMarkerEditingSpaceId':
      if (state.ui.markerEditingSpaceId === action.payload) return state;
      return { ...state, ui: { markerEditingSpaceId: action.payload } };
  }
  const next = docReducer(present, action);
  if (next === present) return state;
  if (notUndoable.has(action.type)) return { ...state, present: next };
  const group = groupedUndo.current;
  if (group !== null && group === state.group) return { ...state, present: next };
  return { ...state, past: [...past, present], present: next, future: [], group };
}

let state: RootState = {
  past: [],
  present: { markers: [defaultMarker], decorations: [defaultMarkerDecoration], spaces: [
    { id: 'space-lobby', name: 'Lobby', markerId: 'default', x: 30, y: 40 },
    { id: 'space-cafe', name: 'Cafe', markerId: 'default', x: 55, y: 36 },
    { id: 'space-plaza', name: 'Plaza', markerId: 'default', x: 74, y: 68 },
  ] },
  future: [],
  group: null,
  ui: { markerEditingSpaceId: null },
};
const listeners = new Set<() => void>();

/** One store for the map and the editor-layer islands, which share the same markers. */
const store = {
  getState: () => state,
  dispatch(action: Action) {
    const next = reducer(state, action);
    if (next === state) return;
    state = next;
    listeners.forEach((listener) => listener());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};

export default store;
export type AppDispatch = typeof store.dispatch;

/** Every action dispatched inside `batch` lands in one undo step. */
export const groupedUndo = {
  current: null as string | null,
  batch(callable: () => void, group: string = uuidv4()) {
    this.current = group;
    try {
      callable();
    } finally {
      this.current = null;
    }
  },
};

export const useAppDispatch = () => store.dispatch;
export function useAppSelector<T>(selector: (s: RootState) => T): T {
  const read = () => selector(store.getState());
  return useSyncExternalStore(store.subscribe, read, read);
}

/** Recomputes only when its input changes, so a hook gets the same object back. */
function derive<I, O>(input: (s: RootState) => I, compute: (i: I) => O) {
  let last: { i: I; o: O } | undefined;
  return (s: RootState) => {
    const i = input(s);
    if (!last || last.i !== i) last = { i, o: compute(i) };
    return last.o;
  };
}

export const markersSelector = (s: RootState) => s.present.markers;
export const markerDecorationsSelector = (s: RootState) => s.present.decorations;
export const spacesSelector = (s: RootState) => s.present.spaces;
export const markerEditingSpaceIdSelector = (s: RootState) => s.ui.markerEditingSpaceId;
export const markerEditingSpaceSelector = (s: RootState) => (
  s.present.spaces.find((space) => space.id === s.ui.markerEditingSpaceId)
);

export const mapSpaceToMarkerSelector = derive(
  markersSelector,
  (markers) => (space: SpaceType | undefined) => markers.find((m) => m.id === space?.markerId) ?? markers[0],
);

export const spaceGlobalOrderSelector = derive(
  spacesSelector,
  (spaces) => Object.fromEntries(spaces.map((space, index) => [space.id, index])) as Record<string, number>,
);
