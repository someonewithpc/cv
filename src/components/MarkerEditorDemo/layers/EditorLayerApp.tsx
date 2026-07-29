import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import {
  markerEditingSpaceIdSelector,
  setMarkerEditingSpaceId,
  spacesSelector,
  useAppDispatch,
  useAppSelector,
} from '@/store';
import { StoreProvider } from '@/store/StoreProvider';

import { MarkerEditor } from '../markers/MarkerEditor';
import { useLiveMarkerEditorSessionCount } from '../markers/liveMarkerEditorSession';

/** Dedicated id so the diagram never mutates the live demo's default marker. */
const DIAGRAM_MARKER_ID = 'editor-layer-diagram';

function EditorLayerInner() {
  const dispatch = useAppDispatch();
  const hostRef = useRef<HTMLDivElement>(null);
  const spaces = useAppSelector(spacesSelector);
  const editingSpaceId = useAppSelector(markerEditingSpaceIdSelector);
  const liveSessions = useLiveMarkerEditorSessionCount();
  const space = spaces.find((s) => s.id === 'space-cafe') ?? spaces[0];
  const [pageVisible, setPageVisible] = useState(false);

  // Observe the carousel page — mount host alone can look "visible" while the
  // slide is still off-screen horizontally.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const page = host.closest('section') ?? host;
    const stack = page.closest('article.technical-drawing-stack');
    const io = new IntersectionObserver(
      ([entry]) => setPageVisible(Boolean(entry?.isIntersecting)),
      // >50% so only one full-width carousel slide is "active" at a time.
      { root: stack, threshold: 0.6 },
    );
    io.observe(page);
    return () => io.disconnect();
  }, []);

  // While this slide is active, close the live map editor so its session
  // lock releases and we can mount the embed.
  useLayoutEffect(() => {
    if (!pageVisible || !editingSpaceId) return;
    dispatch(setMarkerEditingSpaceId(null));
  }, [dispatch, pageVisible, editingSpaceId]);

  const ready =
    pageVisible
    && !editingSpaceId
    && liveSessions === 0
    && Boolean(space);

  return (
    <div ref={hostRef} className="editor-layer-host">
      {ready ? (
        <MarkerEditor
          space={{ ...space!, markerId: DIAGRAM_MARKER_ID }}
          baseMarkerId={undefined}
          isNewMarker
          embed
          onClose={() => {}}
        />
      ) : null}
    </div>
  );
}

export default function EditorLayerApp() {
  return (
    <StoreProvider>
      <EditorLayerInner />
    </StoreProvider>
  );
}
