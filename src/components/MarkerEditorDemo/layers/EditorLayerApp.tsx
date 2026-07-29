import { useLayoutEffect, useState } from 'react';

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
  // Marker parts are process-wide singletons — only mount after the live map
  // editor has released them (MockMap clears local state in useLayoutEffect).
  const [ownsSingletons, setOwnsSingletons] = useState(false);

  useLayoutEffect(() => {
    if (editingSpaceId) {
      dispatch(setMarkerEditingSpaceId(null));
      setOwnsSingletons(false);
      return;
    }

    // Defer one frame so MockMap's layout effect can unmount MarkerEditor first.
    const frame = requestAnimationFrame(() => {
      setOwnsSingletons(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [dispatch, editingSpaceId]);

  if (!ownsSingletons || !space) return null;

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
