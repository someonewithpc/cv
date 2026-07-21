import { ActionCreators } from 'redux-undo';
import { v4 as uuidv4 } from 'uuid';

import {
  addMarker,
  groupedUndo,
  setMarkerEditingSpaceId,
  setSpaceMarker,
  updateMarker,
  type AppDispatch,
} from '@/store';

type Step = {
  delay: number;
  run: (dispatch: AppDispatch) => void;
};

const DEMO_MARKER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 2 2" data-kind="editor" data-state-shape-kind="circle" data-state-decoration-kind="empty" data-reactive-state-shapefill-color="%2389ab24"><circle class="marker-shape" cx="0" cy="0" r="0.55" fill="%2389ab24" stroke="white" stroke-width="0.08"/></svg>`;

function toDataUrl(svg: string) {
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

export class AutoPlayController {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stepIndex = 0;
  private paused = false;
  private demoMarkerId: string | null = null;
  private readonly dispatch: AppDispatch;
  private readonly onEditingChange: (spaceId: string | null) => void;

  constructor(dispatch: AppDispatch, onEditingChange: (spaceId: string | null) => void) {
    this.dispatch = dispatch;
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
          const id = uuidv4();
          this.demoMarkerId = id;
          const source = toDataUrl(DEMO_MARKER_SVG.replace(/%23/g, '#'));
          groupedUndo.batch(() => {
            dispatch(addMarker({
              id,
              source,
              resolvedSource: DEMO_MARKER_SVG.replace(/%23/g, '#'),
              kind: 'editor',
              size: [57, 57],
              anchor: [28.5, 57],
              popupAnchor: [0, -40],
            }));
            dispatch(setSpaceMarker({ spaceId: 'space-lobby', markerId: id }));
          });
        },
      },
      {
        delay: 1600,
        run: (dispatch) => {
          if (!this.demoMarkerId) return;
          const tinted = DEMO_MARKER_SVG.replace('%2389ab24', '%233d7ea6').replace(/%23/g, '#');
          dispatch(updateMarker({
            id: this.demoMarkerId,
            source: toDataUrl(tinted),
            resolvedSource: tinted,
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
          if (this.demoMarkerId) {
            dispatch(setSpaceMarker({ spaceId: 'space-cafe', markerId: this.demoMarkerId }));
          }
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
        run: () => {
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
