import { ActionCreators } from 'redux-undo';

import {
  markersSelector,
  setMarkerEditingSpaceId,
  setSpaceMarker,
  spacesSelector,
  type AppDispatch,
  type MarkerType,
  type RootState,
} from '@/store';

export type DemoCursorStep = {
  /** `data-demo-target` value, or null to rest on the map. */
  target?: string | null;
  /** Absolute viewport position; used when set (e.g. mid-drag). */
  client?: { x: number; y: number };
  click?: boolean;
  /** Disable cursor CSS transition while following a live drag. */
  dragging?: boolean;
};

type Step = {
  delay: number | (() => number);
  cursor?: DemoCursorStep | (() => DemoCursorStep | undefined);
  /** Fire a real click on the cursor target element. */
  domClick?: boolean | (() => boolean);
  run?: (dispatch: AppDispatch, getState: () => RootState) => void | Promise<void>;
};

type CpDrag = {
  cp: string;
  dx: number;
  dy: number;
  /** Hold Shift while dragging so constrainSnap doesn't eat small moves. */
  disableSnap?: boolean;
};

type DemoPreset = {
  shape: 'circle' | 'teardrop' | 'pin' | 'squircle';
  decoration: 'empty' | 'freeText' | 'spaceNumber' | 'upperSpaceLetter' | 'lowerSpaceLetter' | 'customIcon';
  fill: string;
  border: string;
  /** Decoration/text fill — omit for empty/customIcon (those steps are disabled). */
  textColor?: string;
  /** Free-text decoration content, when `decoration` is `freeText`. */
  text?: string;
  /** Control-point drags while the shape step is active (resize / reshape). */
  shapeDrags: CpDrag[];
  /** Control-point drags while the decoration step is active. */
  decorationDrags: CpDrag[];
};

/** Distinct looks the demo builds once, then re-edits on later loops. */
const DEMO_PRESETS: DemoPreset[] = [
  {
    shape: 'circle',
    decoration: 'freeText',
    fill: '#243b55',
    border: '#f4f0ea',
    textColor: '#f4f0ea',
    text: 'H',
    shapeDrags: [{ cp: 'radiusPoint', dx: -20, dy: 0 }],
    // Past snap tolerance (~0.05 viewBox ≈ 13px); Shift disables snap for a clean nudge.
    decorationDrags: [{ cp: 'center', dx: 0, dy: 18, disableSnap: true }],
  },
  {
    shape: 'teardrop',
    decoration: 'spaceNumber',
    fill: '#3d7ea6',
    border: '#f4f0ea',
    textColor: '#f4f0ea',
    shapeDrags: [{ cp: 'tip', dx: 0, dy: 16 }],
    decorationDrags: [],
  },
  {
    shape: 'pin',
    decoration: 'upperSpaceLetter',
    fill: '#a65d3f',
    border: '#f4f0ea',
    textColor: '#f4f0ea',
    shapeDrags: [{ cp: 'circumference', dx: 18, dy: 0 }],
    decorationDrags: [],
  },
];

function queryDemoTarget(target: string) {
  return document.querySelector(`[data-demo-target="${CSS.escape(target)}"]`);
}

function setNativeInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = Object.getOwnPropertyDescriptor(
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype,
    'value',
  );
  proto?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function mouseEvent(type: string, clientX: number, clientY: number, buttons: number) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX,
    clientY,
    buttons,
  });
  // Constructed MouseEvents can report pageX/pageY as 0 in some browsers.
  Object.defineProperty(event, 'pageX', { configurable: true, get: () => clientX + window.scrollX });
  Object.defineProperty(event, 'pageY', { configurable: true, get: () => clientY + window.scrollY });
  return event;
}

export type DemoCursorHandler = (step: DemoCursorStep) => void;

export class AutoPlayController {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dragRaf: number | null = null;
  private stepIndex = 0;
  private paused = false;
  private presetIndex = 0;
  private demoMarkerIds: Array<MarkerType['id'] | null> = DEMO_PRESETS.map(() => null);
  private sessionIsCreate = false;
  private readonly dispatch: AppDispatch;
  private readonly getState: () => RootState;
  private readonly onEditingChange: (spaceId: string | null) => void;
  private readonly onCursor: DemoCursorHandler;

  constructor(
    dispatch: AppDispatch,
    getState: () => RootState,
    onEditingChange: (spaceId: string | null) => void,
    onCursor: DemoCursorHandler,
  ) {
    this.dispatch = dispatch;
    this.getState = getState;
    this.onEditingChange = onEditingChange;
    this.onCursor = onCursor;
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
    if (this.dragRaf != null) {
      cancelAnimationFrame(this.dragRaf);
      this.dragRaf = null;
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

  private slotIndex() {
    return this.presetIndex % DEMO_PRESETS.length;
  }

  private currentPreset() {
    return DEMO_PRESETS[this.slotIndex()];
  }

  private markerIdForSlot(slot: number): MarkerType['id'] | null {
    const id = this.demoMarkerIds[slot];
    if (id == null) return null;
    const exists = markersSelector(this.getState()).some((m) => m.id === id);
    if (!exists) {
      this.demoMarkerIds[slot] = null;
      return null;
    }
    return id;
  }

  private currentMarkerId() {
    return this.markerIdForSlot(this.slotIndex());
  }

  /** Create a new preset slot, or re-open the marker already made for it. */
  private editorOpenTarget(): string {
    const id = this.currentMarkerId();
    return id == null ? 'selector:create' : `selector:edit:${id}`;
  }

  private animateCpDrag(
    target: string,
    dx: number,
    dy: number,
    disableSnap = false,
  ): Promise<void> {
    return new Promise((resolve) => {
      const handle = queryDemoTarget(target);
      const svg = handle?.closest('svg');
      if (!(handle instanceof Element) || !svg) {
        resolve();
        return;
      }

      const rect = handle.getBoundingClientRect();
      const fromX = rect.left + rect.width / 2;
      const fromY = rect.top + rect.height / 2;
      const toX = fromX + dx;
      const toY = fromY + dy;
      const durationMs = 1100;
      const root = document.documentElement;

      const shiftEvent = (type: 'keydown' | 'keyup', down: boolean) => {
        root.dispatchEvent(new KeyboardEvent(type, {
          key: 'Shift',
          code: 'ShiftLeft',
          shiftKey: down,
          bubbles: true,
          cancelable: true,
        }));
      };

      const finish = (x: number, y: number) => {
        svg.dispatchEvent(mouseEvent('mouseup', x, y, 0));
        if (disableSnap) {
          shiftEvent('keyup', false);
        }
        this.onCursor({ client: { x, y }, dragging: false });
        resolve();
      };

      handle.dispatchEvent(mouseEvent('mousedown', fromX, fromY, 1));
      this.onCursor({ client: { x: fromX, y: fromY }, dragging: true, click: true });

      // Wait for React to commit draggedControlPoint, then optional Shift (snap off).
      window.setTimeout(() => {
        if (this.paused) {
          finish(toX, toY);
          return;
        }

        if (disableSnap) {
          shiftEvent('keydown', true);
        }

        window.setTimeout(() => {
          if (this.paused) {
            finish(toX, toY);
            return;
          }

          const startedAt = performance.now();

          const tick = (now: number) => {
            if (this.paused) {
              this.dragRaf = null;
              finish(toX, toY);
              return;
            }

            const t = Math.min(1, (now - startedAt) / durationMs);
            const eased = t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
            const x = fromX + (toX - fromX) * eased;
            const y = fromY + (toY - fromY) * eased;

            this.onCursor({ client: { x, y }, dragging: true });
            svg.dispatchEvent(mouseEvent('mousemove', x, y, 1));

            if (t < 1) {
              this.dragRaf = requestAnimationFrame(tick);
              return;
            }

            this.dragRaf = null;
            finish(toX, toY);
          };

          this.dragRaf = requestAnimationFrame(tick);
        }, disableSnap ? 40 : 0);
      }, 50);
    });
  }

  private dragSteps(drags: CpDrag[]): Step[] {
    return drags.flatMap((drag) => [
      {
        delay: () => (this.sessionIsCreate ? 650 : 40),
        cursor: () => (
          this.sessionIsCreate
            ? { target: `editor:cp:${drag.cp}` }
            : undefined
        ),
      },
      {
        delay: () => (this.sessionIsCreate ? 300 : 40),
        cursor: () => (
          this.sessionIsCreate
            ? { target: `editor:cp:${drag.cp}`, click: true }
            : undefined
        ),
        run: async () => {
          if (!this.sessionIsCreate) return;
          await this.animateCpDrag(
            `editor:cp:${drag.cp}`,
            drag.dx,
            drag.dy,
            drag.disableSnap,
          );
        },
      },
    ]);
  }

  private get steps(): Step[] {
    const preset = () => this.currentPreset();

    return [
      {
        delay: 900,
        cursor: { target: 'pin:space-lobby' },
      },
      {
        delay: 650,
        cursor: { target: 'pin:space-lobby', click: true },
        run: () => {
          this.onEditingChange('space-lobby');
          this.dispatch(setMarkerEditingSpaceId('space-lobby'));
        },
      },
      {
        delay: 900,
        cursor: () => ({ target: this.editorOpenTarget() }),
      },
      {
        delay: 550,
        cursor: () => ({ target: this.editorOpenTarget(), click: true }),
        domClick: true,
        run: () => {
          this.sessionIsCreate = this.currentMarkerId() == null;
          // Keep the space preview on the marker being edited (not a leftover assign).
          const id = this.currentMarkerId();
          if (id != null) {
            this.dispatch(setSpaceMarker({ spaceId: 'space-lobby', markerId: id }));
          }
        },
      },
      {
        delay: 1000,
        cursor: () => ({ target: `editor:shape:${preset().shape}` }),
      },
      {
        delay: 550,
        cursor: () => ({ target: `editor:shape:${preset().shape}`, click: true }),
        domClick: true,
      },
      // Showcase shape control points (resize / reshape) while still on the shape step.
      ...this.dragSteps(preset().shapeDrags),
      {
        delay: 800,
        cursor: { target: 'editor:step:decoration' },
      },
      {
        delay: 550,
        cursor: { target: 'editor:step:decoration', click: true },
        domClick: true,
      },
      {
        delay: 800,
        cursor: () => ({ target: `editor:decoration:${preset().decoration}` }),
      },
      {
        delay: 550,
        cursor: () => ({ target: `editor:decoration:${preset().decoration}`, click: true }),
        domClick: true,
      },
      {
        delay: () => (preset().text != null ? 800 : 40),
        cursor: () => (
          preset().text != null
            ? { target: 'editor:free-text' }
            : undefined
        ),
      },
      {
        delay: () => (preset().text != null ? 550 : 40),
        cursor: () => (
          preset().text != null
            ? { target: 'editor:free-text', click: true }
            : undefined
        ),
        run: () => {
          const text = preset().text;
          if (text == null) return;
          const input = queryDemoTarget('editor:free-text');
          if (input instanceof HTMLTextAreaElement) {
            setNativeInputValue(input, text);
          }
        },
      },
      // Decoration control points (e.g. resize the letter).
      ...this.dragSteps(preset().decorationDrags),
      {
        delay: 800,
        cursor: { target: 'editor:step:shapeFill' },
      },
      {
        delay: 550,
        cursor: { target: 'editor:step:shapeFill', click: true },
        domClick: true,
      },
      {
        delay: 800,
        cursor: { target: 'editor:fill-color:marker-shape' },
      },
      {
        delay: 550,
        cursor: { target: 'editor:fill-color:marker-shape', click: true },
        run: () => {
          const input = queryDemoTarget('editor:fill-color:marker-shape');
          if (input instanceof HTMLInputElement) {
            setNativeInputValue(input, preset().fill);
          }
        },
      },
      {
        delay: 800,
        cursor: { target: 'editor:step:shapeBorderColor' },
      },
      {
        delay: 550,
        cursor: { target: 'editor:step:shapeBorderColor', click: true },
        domClick: true,
      },
      {
        delay: 800,
        cursor: { target: 'editor:border-color:marker-shape' },
      },
      {
        delay: 550,
        cursor: { target: 'editor:border-color:marker-shape', click: true },
        run: () => {
          const input = queryDemoTarget('editor:border-color:marker-shape');
          if (input instanceof HTMLInputElement) {
            setNativeInputValue(input, preset().border);
          }
        },
      },
      {
        delay: () => (preset().textColor != null ? 800 : 40),
        cursor: () => (
          preset().textColor != null
            ? { target: 'editor:step:decorationFill' }
            : undefined
        ),
      },
      {
        delay: () => (preset().textColor != null ? 550 : 40),
        cursor: () => (
          preset().textColor != null
            ? { target: 'editor:step:decorationFill', click: true }
            : undefined
        ),
        domClick: () => preset().textColor != null,
      },
      {
        delay: () => (preset().textColor != null ? 800 : 40),
        cursor: () => (
          preset().textColor != null
            ? { target: 'editor:fill-color:marker-decoration' }
            : undefined
        ),
      },
      {
        delay: () => (preset().textColor != null ? 550 : 40),
        cursor: () => (
          preset().textColor != null
            ? { target: 'editor:fill-color:marker-decoration', click: true }
            : undefined
        ),
        run: () => {
          const color = preset().textColor;
          if (color == null) return;
          const input = queryDemoTarget('editor:fill-color:marker-decoration');
          if (input instanceof HTMLInputElement) {
            setNativeInputValue(input, color);
          }
        },
      },
      {
        delay: 1000,
        cursor: { target: 'editor:save' },
      },
      {
        delay: 550,
        cursor: { target: 'editor:save', click: true },
        domClick: true,
        run: () => {
          const slot = this.slotIndex();
          const lobby = spacesSelector(this.getState()).find((s) => s.id === 'space-lobby');
          if (lobby?.markerId != null) {
            this.demoMarkerIds[slot] = lobby.markerId;
          }
        },
      },
      {
        delay: 800,
        cursor: () => ({ target: `selector:marker:${this.currentMarkerId()}` }),
      },
      {
        delay: 550,
        cursor: () => ({ target: `selector:marker:${this.currentMarkerId()}`, click: true }),
        domClick: true,
      },
      {
        delay: 900,
        cursor: { target: 'pin:space-cafe' },
      },
      {
        delay: 650,
        cursor: { target: 'pin:space-cafe', click: true },
        run: () => {
          this.onEditingChange('space-cafe');
          this.dispatch(setMarkerEditingSpaceId('space-cafe'));
        },
      },
      {
        delay: 900,
        cursor: () => ({ target: `selector:marker:${this.currentMarkerId()}` }),
      },
      {
        delay: 550,
        cursor: () => ({ target: `selector:marker:${this.currentMarkerId()}`, click: true }),
        run: (dispatch) => {
          const markerId = this.currentMarkerId();
          if (markerId != null) {
            dispatch(setSpaceMarker({ spaceId: 'space-cafe', markerId }));
          }
          this.onEditingChange(null);
          dispatch(setMarkerEditingSpaceId(null));
        },
      },
      {
        delay: 1000,
        cursor: { target: null },
      },
      {
        delay: 700,
        cursor: { target: null, click: true },
        run: (dispatch) => {
          dispatch(ActionCreators.undo());
        },
      },
      {
        delay: 900,
        cursor: { target: null, click: true },
        run: (dispatch) => {
          dispatch(ActionCreators.redo());
        },
      },
      {
        delay: 1600,
        cursor: { target: null },
        run: () => {
          this.presetIndex = (this.presetIndex + 1) % DEMO_PRESETS.length;
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

    const delay = typeof step.delay === 'function' ? step.delay() : step.delay;
    this.timer = setTimeout(() => {
      void this.executeStep(step);
    }, delay);
  }

  private async executeStep(step: Step) {
    if (this.paused) return;
    const cursor = step.cursor
      ? (typeof step.cursor === 'function' ? step.cursor() : step.cursor)
      : undefined;
    if (cursor) {
      this.onCursor(cursor);
    }
    const shouldClick = typeof step.domClick === 'function' ? step.domClick() : step.domClick;
    if (shouldClick && cursor?.target) {
      const el = queryDemoTarget(cursor.target);
      if (el instanceof HTMLElement) {
        el.click();
      }
    }
    await step.run?.(this.dispatch, this.getState);
    if (this.paused) return;
    this.stepIndex += 1;
    if (this.stepIndex >= this.steps.length) {
      this.stepIndex = 0;
    }
    this.scheduleNext();
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
