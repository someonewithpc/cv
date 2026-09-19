import { ActionCreators } from 'redux-undo';

import {
  demoPress,
  demoPressDown,
  demoRelease,
} from '@/components/TechnicalDrawing/demo-cursor-press';

import {
  markersSelector,
  removeMarker,
  setMarkerEditingSpaceId,
  setSpaceMarker,
  setSpaces,
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
  /**
   * Where the cursor goes. With `click`, the step presses there before `run`: the target
   * element, or the map at the cursor's rest point when there is no target. A step whose
   * `run` drags leaves `click` unset and presses inside the drag instead.
   */
  cursor?: DemoCursorStep | (() => DemoCursorStep | undefined);
  /** Let the press end in a real click on the cursor target element. */
  domClick?: boolean | (() => boolean);
  run?: (dispatch: AppDispatch, getState: () => RootState) => void | Promise<void>;
};

/** Editor-canvas width (px) the presets' control-point drags were tuned on. */
const DRAG_REFERENCE_CANVAS_PX = 450;

/** Where the cursor rests on the map between targets, as a fraction of the overlay. */
export const REST_CURSOR_FRACTION = { x: 0.48, y: 0.44 };

type CpDrag = {
  cp: string;
  /** Px at the reference canvas width — scaled to the live canvas when run. */
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
  /** Space opened for editing / creating this preset's marker. */
  primarySpaceId: string;
  /** Second space used to demo assigning the same marker. */
  secondarySpaceId: string;
  /** Decoration/text fill — omit for empty/customIcon (those steps are disabled). */
  textColor?: string;
  /** Free-text decoration content, when `decoration` is `freeText`. */
  text?: string;
  /** Shape border style — omit to leave the default solid border alone. */
  shapeBorder?: 'none' | 'solid' | 'dashed';
  /** Border width slider (shape border Configuration). */
  borderWidth?: number;
  /** Dashed border dash/gap sliders. */
  dashLength?: number;
  gapLength?: number;
  /** Control-point drags while the shape step is active (resize / reshape). */
  shapeDrags: CpDrag[];
  /** Control-point drags while the decoration step is active. */
  decorationDrags: CpDrag[];
};

/** Distinct looks the demo builds once, then re-edits on later loops. */
const DEMO_PRESETS: DemoPreset[] = [
  {
    shape: 'circle',
    decoration: 'upperSpaceLetter',
    fill: '#243b55',
    border: '#f4f0ea',
    textColor: '#f4f0ea',
    primarySpaceId: 'space-lobby',
    secondarySpaceId: 'space-cafe',
    shapeDrags: [{ cp: 'radiusPoint', dx: -20, dy: 0 }],
    decorationDrags: [
      { cp: 'center', dx: 0, dy: 12, disableSnap: true },
      { cp: 'textSizeCP', dx: -14, dy: 0 },
    ],
  },
  {
    shape: 'teardrop',
    decoration: 'spaceNumber',
    fill: '#3d7ea6',
    border: '#f4f0ea',
    textColor: '#f4f0ea',
    primarySpaceId: 'space-lobby',
    secondarySpaceId: 'space-cafe',
    shapeBorder: 'dashed',
    borderWidth: 0.028,
    dashLength: 0.2,
    // Widen, shorten the tip, then drop the bulb join so the arc is tangent to the sides.
    shapeDrags: [
      { cp: 'sectorStart', dx: -22, dy: 0 },
      { cp: 'tip', dx: 0, dy: -28 },
      { cp: 'sectorStart', dx: 6, dy: 24 },
    ],
    decorationDrags: [{ cp: 'center', dx: 0, dy: 18, disableSnap: true }],
  },
  {
    shape: 'pin',
    decoration: 'upperSpaceLetter',
    fill: '#a65d3f',
    border: '#f4f0ea',
    textColor: '#f4f0ea',
    primarySpaceId: 'space-plaza',
    secondarySpaceId: 'space-cafe',
    // Circumference handle sits on the left — drag further left to enlarge the bulb.
    shapeDrags: [{ cp: 'circumference', dx: -42, dy: 0 }],
    decorationDrags: [
      { cp: 'center', dx: 0, dy: 14, disableSnap: true },
      // Pull the size handle inward so “C” sits inside the bulb.
      { cp: 'textSizeCP', dx: -16, dy: 0 },
    ],
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

function elementCentre(el: Element) {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** A press at the element centre, where the drawn cursor rests, ending in a click or not. */
function press(el: Element, click: boolean) {
  return demoPress(el, elementCentre(el), { click });
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

export type DemoToastPayload = {
  action: string;
  keys?: string[];
};

export function undoRedoShortcut(action: 'Undo' | 'Redo'): DemoToastPayload {
  const isApple = typeof navigator !== 'undefined'
    && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
  if (isApple) {
    return action === 'Undo'
      ? { action, keys: ['⌘', 'Z'] }
      : { action, keys: ['⌘', '⇧', 'Z'] };
  }
  return action === 'Undo'
    ? { action, keys: ['Ctrl', 'Z'] }
    : { action, keys: ['Ctrl', 'Shift', 'Z'] };
}

export const autoplayStartedToast = (): DemoToastPayload => ({
  action: 'Demo playing · move to take over',
});

export const autoplayPausedToast = (): DemoToastPayload => ({
  action: 'Demo paused',
});

export const autoplayCompletedToast = (): DemoToastPayload => ({
  action: 'Demo complete · looping again',
});

export type DemoToastHandler = (toast: DemoToastPayload) => void;

export class AutoPlayController {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dragRaf: number | null = null;
  /** Release an in-flight drag/slider so the real pointer isn't fighting demo state. */
  private dragCleanup: (() => void) | null = null;
  private stepIndex = 0;
  private paused = false;
  private presetIndex = 0;
  private demoMarkerIds: Array<MarkerType['id'] | null> = DEMO_PRESETS.map(() => null);
  private sessionIsCreate = false;
  private readonly dispatch: AppDispatch;
  private readonly getState: () => RootState;
  private readonly onEditingChange: (spaceId: string | null) => void;
  private readonly onCursor: DemoCursorHandler;
  private readonly onToast: DemoToastHandler;

  constructor(
    dispatch: AppDispatch,
    getState: () => RootState,
    onEditingChange: (spaceId: string | null) => void,
    onCursor: DemoCursorHandler,
    onToast: DemoToastHandler = () => {},
  ) {
    this.dispatch = dispatch;
    this.getState = getState;
    this.onEditingChange = onEditingChange;
    this.onCursor = onCursor;
    this.onToast = onToast;
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
    const cleanup = this.dragCleanup;
    this.dragCleanup = null;
    cleanup?.();
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.scheduleNext();
  }

  /** Jump back to the first preset's first step, as if a loop had just completed. */
  restart() {
    this.pause();
    this.resetDemo(this.dispatch);
    this.stepIndex = 0;
    this.presetIndex = 0;
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

  /** Rest the fake cursor outside the map frame (cycle boundary). */
  private offMapCursor(): DemoCursorStep {
    const overlay = document.querySelector('.mock-map-overlay');
    if (overlay) {
      const rect = overlay.getBoundingClientRect();
      return { client: { x: rect.left + rect.width * 0.88, y: rect.bottom + 52 } };
    }
    return { client: { x: window.innerWidth - 48, y: window.innerHeight - 48 } };
  }

  /** A press on the map itself, where the cursor rests when a step has no target. */
  private pressMap() {
    const overlay = document.querySelector('.mock-map-overlay');
    if (!overlay) return Promise.resolve();
    const rect = overlay.getBoundingClientRect();
    return demoPress(overlay, {
      x: rect.left + rect.width * REST_CURSOR_FRACTION.x,
      y: rect.top + rect.height * REST_CURSOR_FRACTION.y,
    }, { click: false });
  }

  /** Close UI and restore the map to the default markers so the demo can loop cleanly. */
  private resetDemo(dispatch: AppDispatch) {
    this.onEditingChange(null);
    dispatch(setMarkerEditingSpaceId(null));

    const spaces = spacesSelector(this.getState());
    dispatch(setSpaces(spaces.map((space) => ({ ...space, markerId: 'default' }))));

    for (const id of this.demoMarkerIds) {
      if (id != null) {
        dispatch(removeMarker(id));
      }
    }
    this.demoMarkerIds = DEMO_PRESETS.map(() => null);
    this.sessionIsCreate = false;
    dispatch(ActionCreators.clearHistory());
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
      if (!(handle instanceof Element) || !svg || this.paused) {
        resolve();
        return;
      }

      const rect = handle.getBoundingClientRect();
      const fromX = rect.left + rect.width / 2;
      const fromY = rect.top + rect.height / 2;
      // The canvas maps its client rect onto a fixed viewBox, so a preset's px
      // delta moves the point further in shape units the smaller the editor is.
      // Scale deltas to the canvas the presets were tuned on, or a phone-sized
      // editor blows the shape past the viewBox.
      const dragScale = svg.getBoundingClientRect().width / DRAG_REFERENCE_CANVAS_PX;
      const toX = fromX + dx * dragScale;
      const toY = fromY + dy * dragScale;
      const durationMs = 620;
      const root = document.documentElement;
      let curX = fromX;
      let curY = fromY;
      let settled = false;
      let shiftHeld = false;

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
        if (settled) return;
        settled = true;
        if (this.dragCleanup === cleanup) {
          this.dragCleanup = null;
        }
        if (this.dragRaf != null) {
          cancelAnimationFrame(this.dragRaf);
          this.dragRaf = null;
        }
        demoRelease(svg, { x, y });
        if (shiftHeld) {
          shiftEvent('keyup', false);
          shiftHeld = false;
        }
        this.onCursor({ client: { x, y }, dragging: false });
        resolve();
      };

      const cleanup = () => {
        finish(curX, curY);
      };
      this.dragCleanup = cleanup;

      // The hold before the first move is also when React commits draggedControlPoint.
      const held = demoPressDown(handle, { x: fromX, y: fromY });
      this.onCursor({ client: { x: fromX, y: fromY }, dragging: true, click: true });

      // Then optional Shift (snap off), and the moves.
      void held.then(() => {
        if (settled || this.paused) {
          cleanup();
          return;
        }

        if (disableSnap) {
          shiftEvent('keydown', true);
          shiftHeld = true;
        }

        window.setTimeout(() => {
          if (settled || this.paused) {
            cleanup();
            return;
          }

          const startedAt = performance.now();

          const tick = (now: number) => {
            if (settled || this.paused) {
              this.dragRaf = null;
              cleanup();
              return;
            }

            const t = Math.min(1, (now - startedAt) / durationMs);
            const eased = t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
            curX = fromX + (toX - fromX) * eased;
            curY = fromY + (toY - fromY) * eased;

            this.onCursor({ client: { x: curX, y: curY }, dragging: true });
            svg.dispatchEvent(mouseEvent('mousemove', curX, curY, 1));

            if (t < 1) {
              this.dragRaf = requestAnimationFrame(tick);
              return;
            }

            this.dragRaf = null;
            finish(toX, toY);
          };

          this.dragRaf = requestAnimationFrame(tick);
        }, disableSnap ? 40 : 0);
      });
    });
  }

  private dragSteps(drags: CpDrag[]): Step[] {
    return drags.flatMap((drag) => [
      {
        delay: () => (this.sessionIsCreate ? 380 : 40),
        cursor: () => (
          this.sessionIsCreate
            ? { target: `editor:cp:${drag.cp}` }
            : undefined
        ),
      },
      {
        delay: () => (this.sessionIsCreate ? 160 : 40),
        cursor: () => (
          this.sessionIsCreate
            ? { target: `editor:cp:${drag.cp}` }
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

  private animateRangeInput(target: string, toValue: number): Promise<void> {
    return new Promise((resolve) => {
      const input = queryDemoTarget(target);
      if (!(input instanceof HTMLInputElement) || input.type !== 'range' || this.paused) {
        resolve();
        return;
      }

      const rect = input.getBoundingClientRect();
      const min = parseFloat(input.min || '0');
      const max = parseFloat(input.max || '1');
      const from = parseFloat(input.value);
      const durationMs = 420;
      let startedAt = 0;
      let settled = false;
      let curValue = from;

      const thumb = (value: number) => {
        const t = max === min ? 0 : (value - min) / (max - min);
        return { x: rect.left + rect.width * t, y: rect.top + rect.height / 2 };
      };

      const finish = (value: number) => {
        if (settled) return;
        settled = true;
        if (this.dragCleanup === cleanup) {
          this.dragCleanup = null;
        }
        if (this.dragRaf != null) {
          cancelAnimationFrame(this.dragRaf);
          this.dragRaf = null;
        }
        setNativeInputValue(input, String(value));
        demoRelease(input, thumb(value));
        this.onCursor({ client: thumb(value), dragging: false });
        resolve();
      };

      const cleanup = () => {
        finish(curValue);
      };
      this.dragCleanup = cleanup;

      const held = demoPressDown(input, thumb(from));
      this.onCursor({ client: thumb(from), click: true });

      const tick = (now: number) => {
        if (settled || this.paused) {
          this.dragRaf = null;
          cleanup();
          return;
        }

        const t = Math.min(1, (now - startedAt) / durationMs);
        const eased = t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
        curValue = from + (toValue - from) * eased;
        setNativeInputValue(input, String(curValue));
        this.onCursor({ client: thumb(curValue), dragging: true });

        if (t < 1) {
          this.dragRaf = requestAnimationFrame(tick);
          return;
        }

        this.dragRaf = null;
        finish(toValue);
      };

      void held.then(() => {
        if (settled || this.paused) {
          cleanup();
          return;
        }
        startedAt = performance.now();
        this.dragRaf = requestAnimationFrame(tick);
      });
    });
  }

  private shapeBorderSteps(): Step[] {
    const hasBorder = () => this.currentPreset().shapeBorder != null;
    const hasWidth = () => this.currentPreset().borderWidth != null;
    const hasDash = () => this.currentPreset().dashLength != null;
    const hasGap = () => this.currentPreset().gapLength != null;

    return [
      {
        delay: () => (hasBorder() ? 480 : 40),
        cursor: () => (hasBorder() ? { target: 'editor:step:shapeBorder' } : undefined),
      },
      {
        delay: () => (hasBorder() ? 320 : 40),
        cursor: () => (hasBorder() ? { target: 'editor:step:shapeBorder', click: true } : undefined),
        domClick: () => hasBorder(),
      },
      {
        delay: () => (hasBorder() ? 420 : 40),
        cursor: () => {
          const border = this.currentPreset().shapeBorder;
          return border != null ? { target: `editor:shapeBorder:${border}` } : undefined;
        },
      },
      {
        delay: () => (hasBorder() ? 320 : 40),
        cursor: () => {
          const border = this.currentPreset().shapeBorder;
          return border != null ? { target: `editor:shapeBorder:${border}`, click: true } : undefined;
        },
        domClick: () => hasBorder(),
      },
      {
        delay: () => (hasWidth() ? 380 : 40),
        cursor: () => (hasWidth() ? { target: 'editor:border-width' } : undefined),
      },
      {
        delay: () => (hasWidth() ? 160 : 40),
        cursor: () => (hasWidth() ? { target: 'editor:border-width' } : undefined),
        run: async () => {
          const width = this.currentPreset().borderWidth;
          if (width == null) return;
          await this.animateRangeInput('editor:border-width', width);
        },
      },
      {
        delay: () => (hasDash() ? 380 : 40),
        cursor: () => (hasDash() ? { target: 'editor:dash-length' } : undefined),
      },
      {
        delay: () => (hasDash() ? 160 : 40),
        cursor: () => (hasDash() ? { target: 'editor:dash-length' } : undefined),
        run: async () => {
          const dash = this.currentPreset().dashLength;
          if (dash == null) return;
          await this.animateRangeInput('editor:dash-length', dash);
        },
      },
      {
        delay: () => (hasGap() ? 380 : 40),
        cursor: () => (hasGap() ? { target: 'editor:gap-length' } : undefined),
      },
      {
        delay: () => (hasGap() ? 160 : 40),
        cursor: () => (hasGap() ? { target: 'editor:gap-length' } : undefined),
        run: async () => {
          const gap = this.currentPreset().gapLength;
          if (gap == null) return;
          await this.animateRangeInput('editor:gap-length', gap);
        },
      },
    ];
  }

  private get steps(): Step[] {
    const preset = () => this.currentPreset();
    const primary = () => preset().primarySpaceId;
    const secondary = () => preset().secondarySpaceId;

    return [
      {
        delay: 900,
        cursor: () => ({ target: `pin:${primary()}` }),
      },
      {
        delay: 650,
        cursor: () => ({ target: `pin:${primary()}`, click: true }),
        run: () => {
          const spaceId = primary();
          this.onEditingChange(spaceId);
          this.dispatch(setMarkerEditingSpaceId(spaceId));
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
            this.dispatch(setSpaceMarker({ spaceId: primary(), markerId: id }));
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
        delay: 480,
        cursor: { target: 'editor:step:shapeFill' },
      },
      {
        delay: 320,
        cursor: { target: 'editor:step:shapeFill', click: true },
        domClick: true,
      },
      {
        delay: 420,
        cursor: { target: 'editor:fill-color:marker-shape' },
      },
      {
        delay: 280,
        cursor: { target: 'editor:fill-color:marker-shape', click: true },
        run: () => {
          const input = queryDemoTarget('editor:fill-color:marker-shape');
          if (input instanceof HTMLInputElement) {
            setNativeInputValue(input, preset().fill);
          }
        },
      },
      ...this.shapeBorderSteps(),
      {
        delay: 480,
        cursor: { target: 'editor:step:shapeBorderColor' },
      },
      {
        delay: 320,
        cursor: { target: 'editor:step:shapeBorderColor', click: true },
        domClick: true,
      },
      {
        delay: 420,
        cursor: { target: 'editor:border-color:marker-shape' },
      },
      {
        delay: 280,
        cursor: { target: 'editor:border-color:marker-shape', click: true },
        run: () => {
          const input = queryDemoTarget('editor:border-color:marker-shape');
          if (input instanceof HTMLInputElement) {
            setNativeInputValue(input, preset().border);
          }
        },
      },
      {
        delay: () => (preset().textColor != null ? 480 : 40),
        cursor: () => (
          preset().textColor != null
            ? { target: 'editor:step:decorationFill' }
            : undefined
        ),
      },
      {
        delay: () => (preset().textColor != null ? 320 : 40),
        cursor: () => (
          preset().textColor != null
            ? { target: 'editor:step:decorationFill', click: true }
            : undefined
        ),
        domClick: () => preset().textColor != null,
      },
      {
        delay: () => (preset().textColor != null ? 420 : 40),
        cursor: () => (
          preset().textColor != null
            ? { target: 'editor:fill-color:marker-decoration' }
            : undefined
        ),
      },
      {
        delay: () => (preset().textColor != null ? 280 : 40),
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
          const space = spacesSelector(this.getState()).find((s) => s.id === primary());
          if (space?.markerId != null) {
            this.demoMarkerIds[slot] = space.markerId;
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
        cursor: () => ({ target: `pin:${secondary()}` }),
      },
      {
        delay: 650,
        cursor: () => ({ target: `pin:${secondary()}`, click: true }),
        run: () => {
          const spaceId = secondary();
          this.onEditingChange(spaceId);
          this.dispatch(setMarkerEditingSpaceId(spaceId));
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
            dispatch(setSpaceMarker({ spaceId: secondary(), markerId }));
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
          this.onToast(undoRedoShortcut('Undo'));
          dispatch(ActionCreators.undo());
        },
      },
      {
        delay: 900,
        cursor: { target: null, click: true },
        run: (dispatch) => {
          this.onToast(undoRedoShortcut('Redo'));
          dispatch(ActionCreators.redo());
        },
      },
      {
        delay: 1200,
        cursor: () => {
          const next = (this.presetIndex + 1) % DEMO_PRESETS.length;
          // Leaving the map signals the end of a full cycle before we reset.
          return next === 0 ? this.offMapCursor() : { target: null };
        },
      },
      {
        delay: 900,
        cursor: () => {
          const next = (this.presetIndex + 1) % DEMO_PRESETS.length;
          return next === 0 ? this.offMapCursor() : { target: null };
        },
        run: (dispatch) => {
          const next = (this.presetIndex + 1) % DEMO_PRESETS.length;
          if (next === 0) {
            this.onToast(autoplayCompletedToast());
            this.resetDemo(dispatch);
          }
          this.presetIndex = next;
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
    if (cursor?.click) {
      const click = Boolean(typeof step.domClick === 'function' ? step.domClick() : step.domClick);
      if (cursor.target == null) {
        await this.pressMap();
      } else {
        const el = queryDemoTarget(cursor.target);
        if (el) await press(el, click);
      }
    }
    await step.run?.(this.dispatch, this.getState);
    this.stepIndex += 1;
    if (this.stepIndex >= this.steps.length) {
      this.stepIndex = 0;
    }
    // Paused mid-step: wait here; resume() will schedule the following step.
    if (this.paused) return;
    this.scheduleNext();
  }
}

export function bindUndoRedoKeys(
  target: HTMLElement,
  dispatch: AppDispatch,
  onToast: DemoToastHandler = () => {},
) {
  const onKeyDown = (e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod || e.key.toLowerCase() !== 'z') return;
    e.preventDefault();
    if (e.shiftKey) {
      onToast(undoRedoShortcut('Redo'));
      dispatch(ActionCreators.redo());
    } else {
      onToast(undoRedoShortcut('Undo'));
      dispatch(ActionCreators.undo());
    }
  };

  target.addEventListener('keydown', onKeyDown);
  return () => target.removeEventListener('keydown', onKeyDown);
}
