import { reducedMotion } from '@/client/autoplayStatus';
import { documentGate } from '@/client/frontPage';
import { demoPress } from '@/components/TechnicalDrawing/demo-cursor-press';

import {
  DEFAULT_LAYOUT_OPTIONS,
  type LayoutStyle,
} from './scene/layoutEngine';
import type { SpaceBuilderScene } from './scene/SpaceBuilderScene';
import { CATALOG_ITEMS, variantOf } from './catalogItems';

export type DemoCursorStep = {
  target?: string | null;
  client?: { x: number; y: number };
  click?: boolean;
  dragging?: boolean;
};

type Step = {
  delay: number | (() => number);
  cursor?: DemoCursorStep | (() => DemoCursorStep | undefined);
  domClick?: boolean | (() => boolean);
  /** Fire a real dblclick on the aimed demo target (catalog confirm → Build). */
  domDblClick?: boolean | (() => boolean);
  run?: () => void | Promise<void>;
};

export type DemoCursorHandler = (step: DemoCursorStep) => void;

export type DemoToastPayload = {
  action: string;
};

export type DemoToastHandler = (toast: DemoToastPayload) => void;

export type DemoUiHandler = (patch: {
  panel?: 'closed' | 'catalog' | 'options';
  phase?: 'idle' | 'build' | 'placing';
  /** Which catalog card the walkthrough is holding, so the card reads as picked. */
  catalogId?: string;
}) => void;

export const autoplayStartedToast = (): DemoToastPayload => ({
  action: 'Demo playing · take over anytime',
});

export const autoplayPausedToast = (): DemoToastPayload => ({
  action: 'Demo paused',
});

export const autoplayCompletedToast = (): DemoToastPayload => ({
  action: 'Demo complete · looping again',
});

function queryDemoTarget(target: string) {
  const scope = document.querySelector('.space-builder-app');
  const root = scope ?? document;
  return root.querySelector(`[data-demo-target="${CSS.escape(target)}"]`);
}

/** Set an input value the way a user would, so Vue `@input` / `@change` handlers fire. */
function setNativeInputValue(input: HTMLInputElement, value: string) {
  const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  proto?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Per-keystroke timing for demo typing into Blocks of (must read as real typing). */
const TYPE_FOCUS_MS = 450;
const TYPE_CLEAR_MS = 320;
const TYPE_CHAR_MS = 380;
const TYPE_AFTER_CHAR_MS = 140;
const TYPE_FIELD_GAP_MS = 520;

/** Matches `.space-builder-demo-cursor` left/top transition duration. */
const CURSOR_TRAVEL_MS = 560;
const SIDEBAR_SCROLL_MS = 480;
/** Ignore sub-pixel / layout jitter when deciding whether the cursor actually moved. */
const CURSOR_MOVE_EPS_PX = 8;

const wait = (ms: number) => documentGate().wait(ms);

function waitFrames(count = 1) {
  return new Promise<void>((resolve) => {
    const step = (left: number) => {
      if (left <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(() => step(left - 1));
    };
    step(count);
  });
}

function prefersReducedMotion() {
  return reducedMotion(document.querySelector('.space-builder-app'));
}

function typingDelay(ms: number) {
  return prefersReducedMotion() ? Math.max(40, Math.round(ms * 0.35)) : ms;
}

function targetCenter(el: Element) {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function isVisibleInScroller(el: HTMLElement, scroller: HTMLElement, pad = 12) {
  const elRect = el.getBoundingClientRect();
  const box = scroller.getBoundingClientRect();
  return elRect.bottom > box.top + pad && elRect.top < box.bottom - pad;
}

/** Smoothly scroll a sidebar-body so `el` sits near its vertical center. */
async function animateScrollerToElement(
  scroller: HTMLElement,
  el: HTMLElement,
  onFrame?: (el: HTMLElement) => void,
) {
  const elRect = el.getBoundingClientRect();
  const box = scroller.getBoundingClientRect();
  const pad = 16;
  const fullyVisible = elRect.top >= box.top + pad && elRect.bottom <= box.bottom - pad;
  if (fullyVisible) return false;

  const delta = (elRect.top + elRect.height / 2) - (box.top + box.height / 2);
  const from = scroller.scrollTop;
  const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  const to = Math.max(0, Math.min(max, from + delta));
  if (Math.abs(to - from) < 1) return false;

  if (prefersReducedMotion()) {
    scroller.scrollTop = to;
    onFrame?.(el);
    return true;
  }

  const duration = SIDEBAR_SCROLL_MS;
  const t0 = performance.now();
  await new Promise<void>((resolve) => {
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      const eased = t * t * (3 - 2 * t);
      scroller.scrollTop = from + (to - from) * eased;
      onFrame?.(el);
      if (t < 1) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
  return true;
}

/**
 * Open ancestor <details> and animate the sidebar scroller so `target` is visible.
 * `onScrollFrame` runs each scroll tick so the demo cursor can ride the control.
 */
async function revealDemoTarget(
  target: string,
  onScrollFrame?: (el: HTMLElement) => void,
) {
  const el = queryDemoTarget(target);
  if (!(el instanceof HTMLElement)) return null;

  const wasClosed = el.closest('details:not([open])');
  wasClosed?.setAttribute('open', '');
  if (wasClosed) {
    // Let the open section lay out before measuring scroll.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }

  const scroller = el.closest('.sidebar-body');
  if (scroller instanceof HTMLElement) {
    await animateScrollerToElement(scroller, el, onScrollFrame);
  }

  return el;
}

type Preset = {
  kind: 'build' | 'dnd' | 'banquet';
  style: LayoutStyle;
  seats: number;
  distanceX: number;
  distanceZ: number;
  aisle?: number;
  /** Shown later via the Blocks of inputs — not applied with the initial layout. */
  blocks?: { width: number; height: number };
  angle?: number;
  offset?: number;
  innerDiameter?: number;
};

const PRESETS: Preset[] = [
  {
    kind: 'build',
    style: 'grid',
    seats: 0,
    distanceX: 0.2,
    distanceZ: 0.35,
    // Typed into Blocks of after a plain Grid fill so the aisle demo reads clearly.
    aisle: 0.95,
    blocks: { width: 3, height: 2 },
  },
  // The chair loop again, cut to its bones, on the object a caterer actually lays out.
  { kind: 'banquet', style: 'grid', seats: 0, distanceX: 0.2, distanceZ: 0.35 },
  { kind: 'build', style: 'offset', seats: 0, distanceX: 0.2, distanceZ: 0.35, offset: 0 },
  { kind: 'build', style: 'hollow', seats: 0, distanceX: 0.25, distanceZ: 0.4 },
  { kind: 'dnd', style: 'grid', seats: 0, distanceX: 0.2, distanceZ: 0.35 },
  { kind: 'build', style: 'chevron', seats: 0, distanceX: 0.18, distanceZ: 0.32, aisle: 1.1, angle: Math.PI / 7 },
  { kind: 'build', style: 'circle', seats: 0, distanceX: 0.15, distanceZ: 0.4, innerDiameter: 1.2 },
  { kind: 'build', style: 'u_shape', seats: 0, distanceX: 0.22, distanceZ: 0.35 },
];

type FloorArea = { start: { x: number; z: number }; end: { x: number; z: number } };

/**
 * The rectangles the chair loop draws, largest first. It takes the first one whose four corners
 * the camera has on screen, so a wide sheet fills most of its floor with chairs and a narrow
 * one still draws a rectangle it can show whole.
 */
const FLOOR_AREAS: FloorArea[] = [
  { start: { x: -4.6, z: -3.6 }, end: { x: 4.8, z: 4.2 } },
  { start: { x: -4.0, z: -3.0 }, end: { x: 4.2, z: 3.6 } },
  { start: { x: -3.2, z: -2.4 }, end: { x: 3.4, z: 3.0 } },
];

function areaCorners({ start, end }: FloorArea) {
  return [start, end, { x: start.x, z: end.z }, { x: end.x, z: start.z }];
}

/**
 * The seat count the banquet loop takes off the card's variant picker. Six seats at the
 * same table size is its own library object, so the pick swaps the model in the scene.
 */
const BANQUET_PICKED_PAX = 6;

function blocksDemoOf(preset: Preset) {
  const blocks = preset.blocks;
  if (!blocks || (blocks.width <= 0 && blocks.height <= 0)) return null;
  return blocks;
}

export class AutoPlayController {
  private timer: (() => void) | null = null;
  private stepIndex = 0;
  private paused = false;
  private presetIndex = 0;
  /** Last aimed tip position — travel wait must key off pixels, not target ids. */
  private lastCursorClient: { x: number; y: number } | null = null;
  private dragRaf: number | null = null;
  /** Release an in-flight slider drag so takeover doesn't leave a stuck rAF. */
  private dragCleanup: (() => void) | null = null;
  /**
   * Counts the starts. A step in flight awaits presses, cursor travel and tweens the scene
   * runs to the end whatever `paused` says, and pause() cannot reach into them. start() then
   * cleared `paused` again, and the suspended step, seeing it clear, carried on: it bumped
   * the index start() had just reset and scheduled a timer of its own beside the new one,
   * and two chains drove the demo from then on. So every step remembers the generation it
   * started in and stands down once a start has moved it on. A pause alone leaves the step
   * to finish and move the index on, so a resume goes to the next step, not the same one.
   */
  private generation = 0;
  /** The rectangle this lap draws, picked from FLOOR_AREAS as the lap starts. The steps are
   * built afresh for every tick, so it has to outlive them. */
  private floorArea: FloorArea = FLOOR_AREAS[FLOOR_AREAS.length - 1];
  /** The generation of the step now running, so resume() leaves the next step to it. */
  private inFlight: number | null = null;
  /** True while the walkthrough focuses a field itself, so the app can tell that focusin from a visitor's. */
  focusing = false;
  private readonly scene: SpaceBuilderScene;
  private readonly onCursor: DemoCursorHandler;
  private readonly onToast: DemoToastHandler;
  private readonly onUi: DemoUiHandler;

  constructor(
    scene: SpaceBuilderScene,
    onCursor: DemoCursorHandler,
    onToast: DemoToastHandler,
    onUi: DemoUiHandler,
  ) {
    this.scene = scene;
    this.onCursor = onCursor;
    this.onToast = onToast;
    this.onUi = onUi;
  }

  /** Fresh beginning — initial appear, or re-appearing after being scrolled out of view. */
  start() {
    this.pause();
    this.generation += 1;
    this.stepIndex = 0;
    this.presetIndex = 0;
    this.paused = false;
    this.scheduleNext();
  }

  pause() {
    this.paused = true;
    if (this.timer) {
      this.timer();
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
    // A step still running schedules the next one when it ends.
    if (this.inFlight !== this.generation) this.scheduleNext();
  }

  destroy() {
    this.pause();
  }

  private currentPreset() {
    return PRESETS[this.presetIndex % PRESETS.length];
  }

  private scheduleNext() {
    if (this.paused) return;
    const steps = this.steps();
    if (this.stepIndex >= steps.length) {
      this.stepIndex = 0;
      this.presetIndex += 1;
      if (this.presetIndex % PRESETS.length === 0) {
        this.onToast(autoplayCompletedToast());
      }
    }
    const step = this.steps()[this.stepIndex];
    const delay = typeof step.delay === 'function' ? step.delay() : step.delay;
    // One timer at a time: a step that resumed into a fresh chain must not add a second.
    this.timer?.();
    this.timer = documentGate().timeout(() => {
      this.timer = null;
      void this.runStep(step);
    }, delay);
  }

  /** CSS cursor travel is a fixed ~0.55s — wait the full duration whenever the tip actually moves. */
  private async waitForCursorTravel(to: { x: number; y: number }) {
    const from = this.lastCursorClient;
    this.lastCursorClient = to;
    if (prefersReducedMotion()) {
      await wait(40);
      return;
    }
    if (!from) {
      await wait(CURSOR_TRAVEL_MS);
      return;
    }
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    await wait(dist < CURSOR_MOVE_EPS_PX ? 48 : CURSOR_TRAVEL_MS);
  }

  private stickCursorTo(el: HTMLElement, target: string, dragging: boolean) {
    const client = targetCenter(el);
    this.lastCursorClient = client;
    this.onCursor({
      client,
      target,
      dragging,
      click: false,
    });
  }

  private async runStep(step: Step) {
    if (this.paused) return;
    const generation = this.generation;
    this.inFlight = generation;
    try {
      const cursor = typeof step.cursor === 'function' ? step.cursor() : step.cursor;
      const shouldClick = typeof step.domClick === 'function' ? step.domClick() : step.domClick;
      const shouldDblClick = typeof step.domDblClick === 'function'
        ? step.domDblClick()
        : step.domDblClick;

      if (cursor?.target) {
        const target = cursor.target;
        const preEl = queryDemoTarget(target);
        if (preEl instanceof HTMLElement) {
          const wasClosed = preEl.closest('details:not([open])');
          wasClosed?.setAttribute('open', '');
          if (wasClosed) {
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          }

          const scroller = preEl.closest('.sidebar-body');
          const alreadyVisible = !(scroller instanceof HTMLElement)
            || isVisibleInScroller(preEl, scroller);

          // Only fly to the control first when it is already on-screen. Aiming at an
          // off-screen rect sends the cursor outside the sidebar before scrolling.
          if (alreadyVisible) {
            const pre = targetCenter(preEl);
            this.onCursor({
              client: pre,
              target,
              dragging: false,
              click: false,
            });
            await this.waitForCursorTravel(pre);
            if (this.paused) return;
          }

          await revealDemoTarget(target, (el) => {
            const box = el.closest('.sidebar-body');
            if (box instanceof HTMLElement && !isVisibleInScroller(el, box)) return;
            // Disable CSS left/top transition so the tip stays glued during the scroll.
            this.stickCursorTo(el, target, true);
          });
          if (this.paused) return;
        } else {
          await revealDemoTarget(target);
          if (this.paused) return;
        }
      }

      // Re-resolve after scroll so coords match the settled layout.
      const aimed = typeof step.cursor === 'function' ? step.cursor() : cursor;

      if (aimed) {
        if (aimed.target) {
          const el = queryDemoTarget(aimed.target);
          const client = el ? targetCenter(el) : aimed.client;
          if (client) {
            this.onCursor({
              client,
              target: aimed.target,
              dragging: aimed.dragging,
              click: false,
            });
            await this.waitForCursorTravel(client);
          }
        } else if (aimed.client) {
          this.onCursor({ ...aimed, click: false });
          await this.waitForCursorTravel(aimed.client);
        } else {
          this.onCursor({ ...aimed, click: false });
        }
        if (this.paused) return;
      }

      if (shouldDblClick && aimed?.target) {
        const el = queryDemoTarget(aimed.target);
        if (el instanceof HTMLElement) {
          const client = targetCenter(el);
          this.lastCursorClient = client;
          this.onCursor({
            client,
            target: aimed.target,
            click: true,
            dragging: aimed.dragging,
          });
          await demoPress(el, client, { click: false, dblclick: true });
        }
      } else if (shouldClick && aimed?.target) {
        const el = queryDemoTarget(aimed.target);
        if (el instanceof HTMLElement) {
          const client = targetCenter(el);
          this.lastCursorClient = client;
          // Final snap to the live rect so the pulse matches the click tip.
          this.onCursor({
            client,
            target: aimed.target,
            click: true,
            dragging: aimed.dragging,
          });
          await demoPress(el, client);
        }
      } else if (aimed?.click) {
        if (aimed.client) this.lastCursorClient = aimed.client;
        this.onCursor({ ...aimed, click: true });
      }

      // A restart during the press or the cursor's travel: the step's own work stays undone.
      if (generation === this.generation) await step.run?.();
    } catch (error) {
      console.debug('Space Builder autoplay step failed', error);
    } finally {
      // Also on the early returns for a pause, which leave the step for resume() to rerun.
      if (this.inFlight === generation) this.inFlight = null;
    }
    // Started over while the step ran: the new chain owns the index and the timer now.
    if (generation !== this.generation) return;
    this.stepIndex += 1;
    this.scheduleNext();
  }

  /** The largest of FLOOR_AREAS on screen and clear of the tool rail, bringing the camera home
   * first if none is. */
  private async fittingArea(): Promise<FloorArea> {
    const canvas = this.scene.renderer.domElement;
    const rail = canvas.closest('.space-builder-app')?.querySelector('.rail');
    // A rail tucked away on a narrow frame is translated off the canvas, so its edge is too.
    const railEdge = rail?.getBoundingClientRect().right ?? -Infinity;
    const fits = () => FLOOR_AREAS.find((area) =>
      this.scene.groundInView(areaCorners(area))
      && areaCorners(area).every((c) => (this.scene.groundToClient(c.x, c.z)?.x ?? -Infinity) > railEdge + 16));
    const area = fits();
    if (area) return area;
    await this.scene.resetCamera();
    return fits() ?? FLOOR_AREAS[FLOOR_AREAS.length - 1];
  }

  private offCanvasCursor(): DemoCursorStep {
    const canvas = this.scene.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    return { client: { x: rect.left + rect.width * 0.9, y: rect.bottom + 40 } };
  }

  private groundCursor(x: number, z: number, extra: Partial<DemoCursorStep> = {}): DemoCursorStep {
    const client = this.scene.groundToClient(x, z);
    return client ? { client, ...extra } : this.offCanvasCursor();
  }

  /** Type into the Blocks of width × height inputs (Vue @input / @change). */
  private async setBlocksOf(width: number, height: number) {
    const host = queryDemoTarget('param:blocks');
    const inputs = host instanceof HTMLElement
      ? host.querySelectorAll('input')
      : null;
    const widthInput = inputs?.[0];
    const heightInput = inputs?.[1];

    if (widthInput instanceof HTMLInputElement) {
      await this.typeIntoInput(widthInput, width > 0 ? String(width) : '');
      if (this.paused) return;
      await wait(typingDelay(TYPE_FIELD_GAP_MS));
      if (this.paused) return;
    }
    if (heightInput instanceof HTMLInputElement) {
      await this.typeIntoInput(heightInput, height > 0 ? String(height) : '');
      if (this.paused) return;
    }
    // Keep scene in sync if a synthetic change was ignored while disabled.
    this.scene.setOptions({ blocks: { width, height } });
  }

  /** Focus, clear, then type `text` one character at a time with visible cadence. */
  private async typeIntoInput(input: HTMLInputElement, text: string) {
    if (input.disabled || this.paused) return;

    const client = targetCenter(input);
    this.stickCursorTo(input, 'param:blocks', false);
    await this.waitForCursorTravel(client);
    if (this.paused) return;

    this.focusing = true;
    try {
      input.focus({ preventScroll: true });
    } finally {
      this.focusing = false;
    }
    this.onCursor({ client, target: 'param:blocks', click: true, dragging: false });
    await wait(typingDelay(90));
    if (this.paused) return;
    this.onCursor({ client, target: 'param:blocks', click: false, dragging: false });

    if (input.value !== '') {
      setNativeInputValue(input, '');
      await waitFrames(2);
      await wait(typingDelay(TYPE_CLEAR_MS));
      if (this.paused) return;
    }

    // Hold on the empty focused field so the caret/focus reads before digits land.
    await wait(typingDelay(TYPE_FOCUS_MS));
    if (this.paused) return;

    let built = '';
    for (const ch of text) {
      built += ch;
      this.onCursor({ client: targetCenter(input), target: 'param:blocks', click: true, dragging: false });
      setNativeInputValue(input, built);
      await waitFrames(2);
      await wait(typingDelay(TYPE_CHAR_MS));
      if (this.paused) return;
      this.onCursor({ client: targetCenter(input), target: 'param:blocks', click: false, dragging: false });
      await wait(typingDelay(TYPE_AFTER_CHAR_MS));
      if (this.paused) return;
    }
  }

  /**
   * Drag a range thumb through one or more values in a single press — no release
   * between waypoints (e.g. spacing down then back up).
   */
  private async animateRangeInput(
    target: string,
    toValue: number | readonly number[],
    durationMs = 520,
  ) {
    const input = queryDemoTarget(target);
    if (!(input instanceof HTMLInputElement) || input.type !== 'range' || input.disabled || this.paused) {
      return;
    }

    const rect = input.getBoundingClientRect();
    const min = parseFloat(input.min || '0');
    const max = parseFloat(input.max || '1');
    const step = parseFloat(input.step) || 0.01;
    const clamp = (value: number) => Math.min(max, Math.max(min, value));
    const waypoints = (Array.isArray(toValue) ? toValue : [toValue]).map(clamp);
    if (waypoints.length === 0) return;

    const thumbX = (value: number) => {
      const t = max === min ? 0 : (value - min) / (max - min);
      // Approximate thumb travel along the track (browser chrome varies slightly).
      return rect.left + 8 + (rect.width - 16) * t;
    };
    const thumbY = rect.top + rect.height / 2;

    let from = parseFloat(input.value);
    // Settle on the current thumb before pressing — don't start mid-track.
    const startClient = { x: thumbX(from), y: thumbY };
    this.onCursor({ client: startClient, target, dragging: false });
    await this.waitForCursorTravel(startClient);
    if (this.paused) return;

    this.onCursor({ client: startClient, target, click: true, dragging: true });

    for (const clampedTo of waypoints) {
      if (this.paused) break;
      await new Promise<void>((resolve) => {
        const startedAt = performance.now();
        let settled = false;
        let curValue = from;
        const segmentFrom = from;

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
          const snapped = Math.round(value / step) * step;
          const finalValue = clamp(Number(snapped.toFixed(4)));
          setNativeInputValue(input, String(finalValue));
          from = finalValue;
          const client = { x: thumbX(finalValue), y: thumbY };
          this.lastCursorClient = client;
          this.onCursor({ client, target, dragging: true });
          resolve();
        };

        const cleanup = () => {
          finish(curValue);
        };
        this.dragCleanup = cleanup;

        const tick = (now: number) => {
          if (settled || this.paused) {
            this.dragRaf = null;
            cleanup();
            return;
          }

          const t = Math.min(1, (now - startedAt) / durationMs);
          const eased = t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
          curValue = segmentFrom + (clampedTo - segmentFrom) * eased;
          setNativeInputValue(input, String(curValue));
          const client = { x: thumbX(curValue), y: thumbY };
          this.lastCursorClient = client;
          this.onCursor({ client, target, dragging: true });

          if (t < 1) {
            this.dragRaf = requestAnimationFrame(tick);
            return;
          }

          this.dragRaf = null;
          finish(clampedTo);
        };

        this.dragRaf = requestAnimationFrame(tick);
      });
    }

    const endClient = { x: thumbX(from), y: thumbY };
    this.lastCursorClient = endClient;
    this.onCursor({ client: endClient, target, dragging: false });
  }

  private steps(): Step[] {
    const preset = this.currentPreset();
    if (preset.kind === 'dnd') return this.dndSteps();
    if (preset.kind === 'banquet') return this.banquetSteps();
    return this.buildSteps(preset);
  }

  /** Style + spacing only — Blocks of is typed in a later step when present. */
  private applyPresetLayout(preset: Preset) {
    this.scene.setOptions({
      style: preset.style,
      seats: preset.seats,
      distanceX: preset.distanceX,
      distanceZ: preset.distanceZ,
      aisle: preset.aisle ?? DEFAULT_LAYOUT_OPTIONS.aisle,
      offset: preset.offset ?? DEFAULT_LAYOUT_OPTIONS.offset,
      angle: preset.angle ?? DEFAULT_LAYOUT_OPTIONS.angle,
      innerDiameter: preset.innerDiameter ?? DEFAULT_LAYOUT_OPTIONS.innerDiameter,
      blocks: { width: 0, height: 0 },
    });
  }

  private buildSteps(preset: Preset): Step[] {
    const blocksDemo = blocksDemoOf(preset);

    return [
      {
        delay: 700,
        cursor: { target: 'tool:add' },
        run: async () => {
          this.scene.reset();
          this.onUi({ panel: 'closed', phase: 'idle' });
          // A viewer who moved the camera keeps the view unless the area about to be drawn is off screen.
          const smallest = FLOOR_AREAS[FLOOR_AREAS.length - 1];
          if (!this.scene.groundInView([smallest.start, smallest.end])) await this.scene.resetCamera();
        },
      },
      {
        delay: 550,
        cursor: { target: 'tool:add', click: true },
        domClick: true,
      },
      {
        delay: 700,
        cursor: { target: 'catalog:chair' },
      },
      {
        delay: 550,
        cursor: { target: 'catalog:chair', click: true },
        // Space Builder advances on double-click; skip the separate Build button.
        domDblClick: true,
        run: () => {
          // Ensure Options is open even if the synthetic dblclick misses (common after a loop).
          this.onUi({ panel: 'options', phase: 'build' });
        },
      },
      // The area is picked once Options is open, since the sidebar takes its width from the
      // viewport and the camera reframes to what is left.
      {
        delay: 400,
        run: async () => {
          this.floorArea = await this.fittingArea();
        },
      },
      {
        delay: 50,
        cursor: () => this.groundCursor(this.floorArea.start.x, this.floorArea.start.z),
      },
      {
        delay: 200,
        cursor: () => this.groundCursor(this.floorArea.start.x, this.floorArea.start.z, { dragging: true }),
        run: async () => {
          const { start, end } = this.floorArea;
          await this.scene.drawAreaAnimated(start, end, 950, (point) => {
            this.onCursor(this.groundCursor(point.x, point.z, { dragging: true }));
          });
          // Save closes the sidebar; reopen Options before the layout/param tour so
          // chips and sliders are on-screen for every loop — not only the first.
          this.onUi({ panel: 'options', phase: 'build' });
          this.applyPresetLayout(preset);
        },
      },
      // Scroll to layout chips — style already applied above; don't re-click it.
      {
        delay: 700,
        cursor: { target: `layout:${preset.style}` },
        run: () => {
          this.onUi({ panel: 'options', phase: 'build' });
        },
      },
      // Layout tour: skip styles already selected so we never double-click Grid (etc.).
      ...(['grid', 'offset', 'hollow', 'chevron', 'circle'] as const)
        .filter((style) => style !== preset.style)
        .map((style) => ({
          delay: 550,
          cursor: { target: `layout:${style}` as const },
          domClick: true,
          run: () => this.scene.setStyle(style),
        })),
      {
        delay: 650,
        cursor: { target: `layout:${preset.style}` },
        domClick: true,
        run: () => this.applyPresetLayout(preset),
      },
      // Params after the style tour: drag spacing / aisle thumbs like a real user.
      {
        delay: 700,
        cursor: { target: 'param:spacing-x' },
        run: async () => {
          const low = Math.max(0.05, preset.distanceX - 0.15);
          await this.animateRangeInput('param:spacing-x', [low, preset.distanceX], 480);
        },
      },
      ...(blocksDemo
        ? [
            {
              delay: 650,
              cursor: { target: 'param:blocks' as const },
              run: async () => {
                this.onUi({ panel: 'options', phase: 'build' });
                await this.setBlocksOf(blocksDemo.width, blocksDemo.height);
              },
            },
            {
              delay: 800,
              cursor: { target: 'param:aisle' as const },
              run: async () => {
                const aisle = preset.aisle ?? DEFAULT_LAYOUT_OPTIONS.aisle;
                // Widen the aisles between blocks, then settle — one continuous drag.
                await this.animateRangeInput(
                  'param:aisle',
                  [Math.min(2, aisle + 0.5), aisle],
                  480,
                );
              },
            },
          ]
        : preset.style === 'chevron'
          ? [
              {
                delay: 550,
                cursor: { target: 'param:aisle' as const },
                run: async () => {
                  const aisle = preset.aisle ?? DEFAULT_LAYOUT_OPTIONS.aisle;
                  await this.animateRangeInput(
                    'param:aisle',
                    [Math.min(2, aisle + 0.35), aisle],
                    480,
                  );
                },
              },
            ]
          : []),
      {
        delay: 700,
        cursor: { target: 'param:seats' },
        run: () => {
          const snap = this.scene.getSnapshot();
          const half = Math.max(1, Math.floor(snap.maxSeats / 2));
          this.scene.setOptions({ seats: half });
        },
      },
      {
        delay: 800,
        cursor: { target: 'param:seats' },
        run: () => {
          // Clear back to fill — the usual Space Builder empty-seats path.
          this.scene.setOptions({ seats: 0 });
        },
      },
      {
        delay: 400,
        cursor: () => {
          const area = this.scene.getSnapshot().area;
          if (!area) return this.offCanvasCursor();
          return this.groundCursor(
            area.x + area.width / 2,
            area.z + area.depth / 2,
            { dragging: true },
          );
        },
        run: async () => {
          const area = this.scene.getSnapshot().area;
          if (!area) return;
          // Grow the area only — rotating the SelectArea after a layout tour left
          // handles/chairs looking broken (especially on chevron).
          await this.scene.resizeAreaAnimated(
            { width: area.width + 0.9, depth: area.depth + 0.55 },
            750,
            (point) => {
              this.onCursor(this.groundCursor(point.x, point.z, { dragging: true }));
            },
          );
        },
      },
      {
        delay: 700,
        cursor: { target: 'action:save' },
      },
      {
        // domClick fires the real save button, which already toasts and closes the
        // panel (saveArrangement, MockSceneApp.vue): no run here or it doubles up.
        delay: 500,
        cursor: { target: 'action:save', click: true },
        domClick: true,
      },
      {
        delay: 1100,
        cursor: () => this.offCanvasCursor(),
      },
    ];
  }

  /**
   * The Add loop over a banquet set: open the catalog, pick the set, take a seat count off
   * its variant picker, drag it onto the floor. No Build pass, because a banquet set is
   * placed one at a time.
   */
  private banquetSteps(): Step[] {
    const item = CATALOG_ITEMS.find((entry) => entry.id === 'table-round')!;
    const variant = variantOf(item, undefined);

    return [
      {
        delay: 700,
        cursor: { target: 'tool:add' },
        run: () => {
          this.scene.reset();
          this.onUi({ panel: 'closed', phase: 'idle' });
        },
      },
      {
        delay: 500,
        cursor: { target: 'tool:add', click: true },
        domClick: true,
      },
      {
        delay: 650,
        cursor: { target: 'catalog:table-round' },
        run: () => {
          // Start the GLB downloading a step before the drag, so the drop has a model.
          this.onUi({ panel: 'catalog', catalogId: item.id });
          this.scene.activateCatalogItem(item.id, variant);
        },
      },
      // The variant picker, where the product keeps it: the set's seats row on its card in
      // the sidebar, opened and picked from before the set is dragged out.
      {
        delay: 600,
        cursor: { target: 'variant:pax' },
      },
      {
        delay: 420,
        cursor: { target: 'variant:pax', click: true },
        domClick: true,
      },
      {
        delay: 700,
        cursor: { target: `variant:pax:${BANQUET_PICKED_PAX}` },
      },
      {
        delay: 420,
        cursor: { target: `variant:pax:${BANQUET_PICKED_PAX}`, click: true },
        domClick: true,
      },
      {
        delay: 600,
        cursor: { target: 'catalog:table-round', dragging: true },
        run: () => {
          this.onUi({ panel: 'catalog', phase: 'placing' });
          this.scene.setGhostVisible(true);
        },
      },
      {
        delay: 250,
        cursor: () => this.groundCursor(-0.4, 0.6, { dragging: true }),
        run: () => {
          const client = this.scene.groundToClient(-0.4, 0.6);
          if (client) this.scene.setGhostAt(client.x, client.y);
        },
      },
      {
        delay: 750,
        cursor: () => this.groundCursor(0.9, -0.4, { dragging: true }),
        run: () => {
          const client = this.scene.groundToClient(0.9, -0.4);
          if (client) this.scene.setGhostAt(client.x, client.y);
        },
      },
      {
        delay: 500,
        cursor: () => this.groundCursor(0.9, -0.4, { click: true }),
        run: () => {
          const placed = this.scene.placeGhostAsSingle();
          this.onToast({ action: placed ? 'Object placed' : 'Still loading · drag again' });
          this.onUi({ panel: 'closed', phase: 'idle' });
        },
      },
      {
        delay: 1400,
        cursor: () => this.offCanvasCursor(),
        run: () => {
          // Hand the next preset back the chair it expects as the live ghost.
          this.onUi({ catalogId: 'chair' });
          this.scene.activateCatalogItem('chair', variantOf(CATALOG_ITEMS[0], undefined));
        },
      },
    ];
  }

  private dndSteps(): Step[] {
    return [
      {
        delay: 700,
        run: () => {
          this.scene.reset();
          this.onUi({ panel: 'closed', phase: 'idle' });
        },
      },
      {
        delay: 500,
        cursor: { target: 'tool:add', click: true },
        domClick: true,
      },
      {
        delay: 650,
        cursor: { target: 'catalog:chair' },
      },
      {
        delay: 200,
        cursor: { target: 'catalog:chair', dragging: true },
        run: () => {
          this.onUi({ panel: 'catalog', phase: 'placing' });
          this.scene.setGhostVisible(true);
        },
      },
      {
        delay: 200,
        cursor: () => this.groundCursor(0.2, 0.4, { dragging: true }),
        run: () => {
          const client = this.scene.groundToClient(0.2, 0.4);
          if (client) this.scene.setGhostAt(client.x, client.y);
        },
      },
      {
        delay: 700,
        cursor: () => this.groundCursor(1.2, -0.6, { dragging: true }),
        run: () => {
          const client = this.scene.groundToClient(1.2, -0.6);
          if (client) this.scene.setGhostAt(client.x, client.y);
        },
      },
      {
        delay: 500,
        cursor: () => this.groundCursor(1.2, -0.6, { click: true }),
        run: () => {
          this.scene.placeGhostAsSingle();
          this.onToast({ action: 'Object placed' });
          this.onUi({ panel: 'closed', phase: 'idle' });
        },
      },
      {
        delay: 1100,
        cursor: () => this.offCanvasCursor(),
      },
    ];
  }
}
