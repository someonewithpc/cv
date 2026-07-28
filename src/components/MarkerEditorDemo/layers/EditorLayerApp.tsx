import { useLayoutEffect } from 'react';

import {
  markerEditingSpaceIdSelector,
  setMarkerEditingSpaceId,
  spacesSelector,
  useAppDispatch,
  useAppSelector,
} from '@/store';
import { StoreProvider } from '@/store/StoreProvider';

import { MarkerEditor } from '../markers/MarkerEditor';

/** Dedicated id so the diagram never mutates the live demo's default marker. */
const DIAGRAM_MARKER_ID = 'editor-layer-diagram';

function EditorLayerInner() {
  const dispatch = useAppDispatch();
  const spaces = useAppSelector(spacesSelector);
  const editingSpaceId = useAppSelector(markerEditingSpaceIdSelector);
  const space = spaces.find((s) => s.id === 'space-cafe') ?? spaces[0];

  // While this diagram page is mounted it owns the marker-part singletons —
  // close the live map editor so we don't render an empty page.
  useLayoutEffect(() => {
    if (editingSpaceId) {
      dispatch(setMarkerEditingSpaceId(null));
    }
  }, [dispatch, editingSpaceId]);

  if (!space) return null;

  return (
    <MarkerEditor
      space={{ ...space, markerId: DIAGRAM_MARKER_ID }}
      baseMarkerId={undefined}
      isNewMarker
      embed
      onClose={() => {}}
    />
  );
}

export default function EditorLayerApp() {
  return (
    <StoreProvider>
      <EditorLayerInner />
    </StoreProvider>
  );
}
