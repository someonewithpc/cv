import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import {
  markerEditingSpaceIdSelector,
  setMarkerEditingSpaceId,
  spacesSelector,
  useAppDispatch,
  useAppSelector,
} from '@/store';
import { StoreProvider } from '@/store/StoreProvider';

import { watchDrawingNote } from '@/client/drawingNote';
import { documentGate, watchPageActive } from '@/client/frontPage';

import { MarkerEditor } from '../markers/MarkerEditor';
import { useLiveMarkerEditorSessionCount } from '../markers/liveMarkerEditorSession';

/** Dedicated id so the diagram never mutates the live demo's default marker. */
const DIAGRAM_MARKER_ID = 'editor-layer-diagram';

/** Sidebar entries the embed clicks through, in order, so the drawing keeps changing. */
const AUTOPLAY_TARGETS = [
  'editor:step:shape',
  'editor:shape:circle',
  'editor:shape:squircle',
  'editor:shape:pin',
  'editor:shape:teardrop',
  'editor:step:decoration',
  'editor:decoration:upperSpaceLetter',
  'editor:decoration:spaceNumber',
  'editor:step:shapeBorder',
  'editor:shapeBorder:dashed',
  'editor:shapeBorder:solid',
];

const AUTOPLAY_STEP_MS = 1400;

function EditorLayerInner() {
  const dispatch = useAppDispatch();
  const hostRef = useRef<HTMLDivElement>(null);
  const spaces = useAppSelector(spacesSelector);
  const editingSpaceId = useAppSelector(markerEditingSpaceIdSelector);
  const liveSessions = useLiveMarkerEditorSessionCount();
  const space = spaces.find((s) => s.id === 'space-cafe') ?? spaces[0];
  const [pageVisible, setPageVisible] = useState(false);
  const [pageActive, setPageActive] = useState(false);
  const stepRef = useRef(0);

  // Once PaperStack's script takes over, every page shares the same grid cell (only the
  // fold's clip-path says which one is drawn on top), so an IntersectionObserver — even
  // rooted at the stack — reports all six as equally "visible" and this diagram would
  // render (and steal the live editor's marker-part singletons) no matter which page a
  // visitor is actually looking at. --page-index is what fold-drag.ts itself updates on a
  // committed flip (front = "1"), so it's the one signal that actually tracks the front page.
  // It is read off the wrapper's inline style, where fold-drag.ts writes it, so the check
  // below forces no style pass each time that style changes.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const section = host.closest('section');
    const wrapper = section?.parentElement;
    if (!wrapper) return;

    const checkFront = () => {
      setPageVisible(wrapper.style.getPropertyValue('--page-index').trim() === '1');
    };
    checkFront();

    const observer = new MutationObserver(checkFront);
    observer.observe(wrapper, { attributes: true, attributeFilter: ['style'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    return watchPageActive(host, (active) => setPageActive(active));
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

  // The embed is inert, so nobody can drive it; play the sidebar back instead.
  // Scoped to this host so the live map editor's own targets are never touched.
  useEffect(() => {
    const host = hostRef.current;
    if (!ready || !pageActive || !host) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let held = false;

    const id = window.setInterval(() => {
      if (held || !documentGate().running) return;
      const target = AUTOPLAY_TARGETS[stepRef.current % AUTOPLAY_TARGETS.length];
      stepRef.current += 1;
      host.querySelector<HTMLElement>(`[data-demo-target="${target}"]`)?.click();
    }, AUTOPLAY_STEP_MS);

    const stopNoteWatch = watchDrawingNote(host, (open) => { held = open; });

    return () => {
      window.clearInterval(id);
      stopNoteWatch();
    };
  }, [ready, pageActive]);

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
