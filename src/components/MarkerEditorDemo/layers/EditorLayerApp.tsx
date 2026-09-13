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

  // Once PaperStack's script takes over, every page shares the same grid cell (only the
  // fold's clip-path says which one is drawn on top), so an IntersectionObserver — even
  // rooted at the stack — reports all six as equally "visible" and this diagram would
  // render (and steal the live editor's marker-part singletons) no matter which page a
  // visitor is actually looking at. --page-index is what fold-drag.ts itself updates on a
  // committed flip (front = "1"), so it's the one signal that actually tracks the front page.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const section = host.closest('section');
    const wrapper = section?.parentElement;
    if (!wrapper) return;

    const checkFront = () => {
      setPageVisible(getComputedStyle(wrapper).getPropertyValue('--page-index').trim() === '1');
    };
    checkFront();

    const observer = new MutationObserver(checkFront);
    observer.observe(wrapper, { attributes: true, attributeFilter: ['style'] });
    return () => observer.disconnect();
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
