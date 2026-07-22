import { ActionCreators } from 'redux-undo';

import store, {
  addMarker,
  assignSpaceMarker,
  BASE_MARKER_ID,
  groupedUndo,
  markersSelector,
  setMarkerEditingSpaceId,
  setSpaceMarker,
  updateMarker,
  type AppDispatch,
  type RootState,
} from '@/store';

type Step = {
  delay: number;
  run: (dispatch: AppDispatch) => void;
};

const DEMO_MARKER_ID = 'demo-shared-marker';

const DEMO_MARKER_SVG_GREEN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 2 2" data-kind="editor" data-state-shape-kind="circle" data-state-decoration-kind="empty" data-reactive-state-shapefill-color="#89ab24"><circle class="marker-shape" cx="0" cy="0" r="0.55" fill="#89ab24" stroke="white" stroke-width="0.08"/></svg>`;
const DEMO_MARKER_SVG_BLUE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 2 2" data-kind="editor" data-state-shape-kind="circle" data-state-decoration-kind="empty" data-reactive-state-shapefill-color="#3d7ea6"><circle class="marker-shape" cx="0" cy="0" r="0.55" fill="#3d7ea6" stroke="white" stroke-width="0.08"/></svg>`;

function toDataUrl(svg: string) {
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

function ensureDemoMarker(dispatch: AppDispatch, getState: () => RootState) {
  const existing = markersSelector(getState()).find((marker) => marker.id === DEMO_MARKER_ID);
  if (existing) {
    dispatch(updateMarker({
      id: DEMO_MARKER_ID,
      source: toDataUrl(DEMO_MARKER_SVG_GREEN),
      resolvedSource: DEMO_MARKER_SVG_GREEN,
    }));
    return;
  }

  dispatch(addMarker({
    id: DEMO_MARKER_ID,
    baseMarkerId: BASE_MARKER_ID,
    source: toDataUrl(DEMO_MARKER_SVG_GREEN),
    resolvedSource: DEMO_MARKER_SVG_GREEN,
    kind: 'editor',
    size: [57, 57],
    anchor: [28.5, 57],
    popupAnchor: [0, -40],
  }));
}

export class AutoPlayController {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stepIndex = 0;
  private paused = false;
  private readonly dispatch: AppDispatch;
  private readonly getState: () => RootState;
  private readonly onEditingChange: (spaceId: string | null) => void;

  constructor(
    dispatch: AppDispatch,
    onEditingChange: (spaceId: string | null) => void,
    getState: () => RootState = () => store.getState(),
  ) {
    this.dispatch = dispatch;
    this.getState = getState;
    this.onEditingChange = onEditingChange;
  }

  start() {
    this.paused = false;
    this.scheduleNext();
  }

  pause() {
    this.paused = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.scheduleNext();
  }

  destroy() {
    this.pause();
  }

  private get steps(): Step[] {
    return [
      {
        delay: 1200,
        run: () => {
          this.onEditingChange('space-lobby');
          this.dispatch(setMarkerEditingSpaceId('space-lobby'));
        },
      },
      {
        delay: 1800,
        run: (dispatch) => {
          groupedUndo.batch(() => {
            ensureDemoMarker(dispatch, this.getState);
            // Reuse the same derived marker — never add a second copy.
            assignSpaceMarker(dispatch, this.getState, 'space-lobby', DEMO_MARKER_ID);
          });
        },
      },
      {
        delay: 1600,
        run: (dispatch) => {
          dispatch(updateMarker({
            id: DEMO_MARKER_ID,
            source: toDataUrl(DEMO_MARKER_SVG_BLUE),
            resolvedSource: DEMO_MARKER_SVG_BLUE,
          }));
        },
      },
      {
        delay: 1400,
        run: () => {
          this.onEditingChange(null);
          this.dispatch(setMarkerEditingSpaceId(null));
        },
      },
      {
        delay: 1000,
        run: () => {
          this.onEditingChange('space-cafe');
          this.dispatch(setMarkerEditingSpaceId('space-cafe'));
        },
      },
      {
        delay: 1600,
        run: (dispatch) => {
          // Cafe starts on the base each loop so undo/redo has a visible shared assign.
          dispatch(setSpaceMarker({ spaceId: 'space-cafe', markerId: DEMO_MARKER_ID }));
          this.onEditingChange(null);
          dispatch(setMarkerEditingSpaceId(null));
        },
      },
      {
        delay: 1200,
        run: (dispatch) => {
          dispatch(ActionCreators.undo());
        },
      },
      {
        delay: 1000,
        run: (dispatch) => {
          dispatch(ActionCreators.redo());
        },
      },
      {
        delay: 2000,
        run: (dispatch) => {
          // Return cafe to the base so the next loop can re-assign the same shared marker.
          dispatch(setSpaceMarker({ spaceId: 'space-cafe', markerId: BASE_MARKER_ID }));
          this.stepIndex = -1;
        },
      },
    ];
  }

  private scheduleNext() {
    if (this.paused) return;
    const steps = this.steps;
    const step = steps[this.stepIndex];
    if (!step) {
      this.stepIndex = 0;
      this.scheduleNext();
      return;
    }

    this.timer = setTimeout(() => {
      if (this.paused) return;
      step.run(this.dispatch);
      this.stepIndex += 1;
      if (this.stepIndex >= steps.length) {
        this.stepIndex = 0;
      }
      this.scheduleNext();
    }, step.delay);
  }
}

export function bindUndoRedoKeys(target: HTMLElement, dispatch: AppDispatch) {
  const onKeyDown = (e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod || e.key.toLowerCase() !== 'z') return;
    e.preventDefault();
    if (e.shiftKey) {
      dispatch(ActionCreators.redo());
    } else {
      dispatch(ActionCreators.undo());
    }
  };

  target.addEventListener('keydown', onKeyDown);
  return () => target.removeEventListener('keydown', onKeyDown);
}
