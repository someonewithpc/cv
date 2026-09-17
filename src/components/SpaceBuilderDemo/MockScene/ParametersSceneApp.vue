<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';

import { watchDrawingNote } from '@/client/drawingNote';
import { onReplayRequest, reportAutoplayState } from '@/client/autoplayStatus';

import { autoplayStartedToast } from './AutoPlayController';
import OptionsPanel from './OptionsPanel.vue';
import type { LayoutOptions, LayoutStyle } from './scene/layoutEngine';
import {
  claimSpaceBuilderGpu,
  prepareSpaceBuilderGpu,
  registerSpaceBuilderGpu,
  releaseSpaceBuilderGpu,
} from './scene/spaceBuilderGpu';
import {
  applyWheelZoom,
  beginPinch,
  trySetPointerCapture,
  updateHandleHoverCursor,
  updatePinch,
  type PinchState,
  type ScreenPoint,
} from './scene/sceneViewportGestures';
import type { SceneSnapshot, SpaceBuilderScene } from './scene/SpaceBuilderScene';

const SEED_OPTIONS: LayoutOptions = {
  style: 'grid',
  seats: 0,
  blocks: { width: 4, height: 3 },
  distanceX: 0.2,
  distanceZ: 0.35,
  aisle: 0.8,
  offset: 0.3,
  angle: Math.PI / 8,
  innerDiameter: 0,
};

const rootRef = ref<HTMLElement | null>(null);
const ready = ref(false);
const loadError = ref(false);
const snapshot = ref<SceneSnapshot | null>(null);
const demoPlaying = ref(false);

const sceneRef = shallowRef<SpaceBuilderScene | null>(null);
let observer: IntersectionObserver | null = null;
let stopNoteWatch: (() => void) | null = null;
let canvasRef: HTMLCanvasElement | null = null;
const activePointers = new Map<number, ScreenPoint>();
let pinch: PinchState | null = null;

const seatsInvalid = ref(false);
let inView = false;
let userControl = false;
let chairsReady = false;
let reducedMotion = false;
let autoplayToken = 0;

function updateSeatsInvalid(snap: SceneSnapshot | null) {
  seatsInvalid.value = Boolean(
    snap?.area && snap.options.seats > 0 && snap.options.seats > snap.maxSeats,
  );
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** Ease + rAF tween of a single numeric option; resolves early if `token` goes stale. */
function tween(token: number, from: number, to: number, ms: number, onFrame: (v: number) => void) {
  return new Promise<void>((resolve) => {
    const start = performance.now();
    const step = (now: number) => {
      if (token !== autoplayToken) {
        resolve();
        return;
      }
      const t = Math.min(1, (now - start) / ms);
      const eased = t * t * (3 - 2 * t);
      onFrame(from + (to - from) * eased);
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

async function runAutoplay() {
  const token = autoplayToken;
  demoPlaying.value = true;
  while (token === autoplayToken) {
    const scene = sceneRef.value;
    if (!scene) break;

    await tween(token, 0.2, 0.55, 900, (v) => scene.setOptions({ distanceX: v }));
    await wait(500);
    await tween(token, 0.55, 0.2, 900, (v) => scene.setOptions({ distanceX: v }));
    await wait(400);
    if (token !== autoplayToken) break;

    await tween(token, 0.35, 0.65, 900, (v) => scene.setOptions({ distanceZ: v }));
    await wait(500);
    await tween(token, 0.65, 0.35, 900, (v) => scene.setOptions({ distanceZ: v }));
    await wait(400);
    if (token !== autoplayToken) break;

    await tween(token, 0.8, 1.5, 900, (v) => scene.setOptions({ aisle: v }));
    await wait(500);
    await tween(token, 1.5, 0.8, 900, (v) => scene.setOptions({ aisle: v }));
    await wait(600);
    if (token !== autoplayToken) break;

    // Push Seat Count over capacity to show the invalid state, then clear it.
    // Read the live cap rather than a fixed number — it depends on the area/spacing.
    const cap = scene.getSnapshot().maxSeats;
    const over = cap + Math.max(20, Math.round(cap * 0.5));
    await tween(token, 0, over, 1000, (v) => scene.setOptions({ seats: Math.round(v) }));
    await wait(1300);
    await tween(token, over, 0, 700, (v) => scene.setOptions({ seats: Math.round(v) }));
    await wait(600);
    if (token !== autoplayToken) break;

    scene.setStyle('circle');
    await wait(700);
    if (token !== autoplayToken) break;
    const maxInner = scene.getSnapshot().innerDiameterMax;
    await tween(token, 0, maxInner, 1000, (v) => scene.setOptions({ innerDiameter: v }));
    await wait(700);
    await tween(token, maxInner, 0, 800, (v) => scene.setOptions({ innerDiameter: v }));
    await wait(500);
    scene.setStyle('grid');
    await wait(900);
  }
  demoPlaying.value = false;
}

function startAutoplay() {
  if (reducedMotion) {
    reportAutoplayState(rootRef.value, 'off');
    return;
  }
  if (userControl || !chairsReady || !inView) return;
  autoplayToken += 1;
  reportAutoplayState(rootRef.value, 'playing');
  void runAutoplay();
}

function restartDemo() {
  userControl = false;
  startAutoplay();
}

// Every caller is a deliberate edit in the Options sidebar, so the visitor keeps
// control until they ask for the walkthrough back from the sheet's status chip.
function yieldToUser() {
  autoplayToken += 1;
  demoPlaying.value = false;
  userControl = true;
  reportAutoplayState(rootRef.value, 'user');
}

function isChrome(target: EventTarget | null) {
  return target instanceof Element && target.closest('.sidebar, button, input, label, details');
}

function onPointerDown(event: PointerEvent) {
  const scene = sceneRef.value;
  const root = rootRef.value;
  if (!scene || !root || isChrome(event.target)) return;

  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  trySetPointerCapture(event.currentTarget, event.pointerId);

  if (activePointers.size >= 2) {
    const [a, b] = activePointers.values();
    if (a && b) pinch = beginPinch(scene, a, b);
    return;
  }

  if (event.button === 2 || (event.button === 0 && (event.shiftKey || event.ctrlKey || event.metaKey))) {
    scene.beginPan(event.clientX, event.clientY);
    return;
  }
  if (event.button !== 0) return;
  scene.beginOrbit(event.clientX, event.clientY);
}

function onPointerMove(event: PointerEvent) {
  const scene = sceneRef.value;
  if (!scene) return;

  if (activePointers.has(event.pointerId)) {
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  }

  if (pinch && activePointers.size >= 2) {
    const [a, b] = activePointers.values();
    if (a && b) updatePinch(scene, pinch, a, b);
    return;
  }

  if (scene.isPanning()) {
    scene.pan(event.clientX, event.clientY);
    return;
  }
  if (scene.isOrbiting()) {
    scene.orbit(event.clientX, event.clientY);
    return;
  }
  if (canvasRef) updateHandleHoverCursor(scene, canvasRef, event.clientX, event.clientY, 'forbid');
}

function onPointerUp(event: PointerEvent) {
  const scene = sceneRef.value;
  activePointers.delete(event.pointerId);
  if (!scene) return;

  if (pinch) {
    if (activePointers.size < 2) {
      pinch = null;
      scene.endPan();
      scene.endOrbit();
    }
    return;
  }
  scene.endPan();
  scene.endOrbit();
}

function onWheel(event: WheelEvent) {
  const scene = sceneRef.value;
  if (!scene || isChrome(event.target)) return;
  applyWheelZoom(scene, event);
}

function onContextMenu(event: Event) {
  event.preventDefault();
}

function onSeats(value: number) {
  yieldToUser();
  sceneRef.value?.setOptions({ seats: value });
}
function onBlockWidth(value: number) {
  yieldToUser();
  sceneRef.value?.setOptions({ blocks: { width: value } });
}
function onBlockHeight(value: number) {
  yieldToUser();
  sceneRef.value?.setOptions({ blocks: { height: value } });
}
function onDistanceX(value: number) {
  yieldToUser();
  sceneRef.value?.setOptions({ distanceX: value });
}
function onDistanceZ(value: number) {
  yieldToUser();
  sceneRef.value?.setOptions({ distanceZ: value });
}
function onAisle(value: number) {
  yieldToUser();
  sceneRef.value?.setOptions({ aisle: value });
}
function onOffset(value: number) {
  yieldToUser();
  sceneRef.value?.setOptions({ offset: value });
}
function onAngle(value: number) {
  yieldToUser();
  sceneRef.value?.setOptions({ angle: value });
}
function onInnerDiameter(value: number) {
  yieldToUser();
  sceneRef.value?.setOptions({ innerDiameter: value });
}
function onStyle(style: LayoutStyle) {
  yieldToUser();
  sceneRef.value?.setStyle(style);
}

function resetOptions() {
  yieldToUser();
  sceneRef.value?.setOptions({
    ...SEED_OPTIONS,
    blocks: { ...SEED_OPTIONS.blocks },
  });
}

const saved = ref(false);
let savedTimer: ReturnType<typeof setTimeout> | null = null;

function saveArrangement() {
  yieldToUser();
  if (!snapshot.value?.valid) return;
  saved.value = true;
  if (savedTimer) clearTimeout(savedTimer);
  savedTimer = setTimeout(() => {
    saved.value = false;
  }, 1800);
}

onMounted(async () => {
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const root = rootRef.value;
  const canvas = root?.querySelector<HTMLCanvasElement>('[data-scene-canvas]');
  const labelHost = root?.querySelector<HTMLElement>('[data-label-host]');
  if (!root || !canvas || !labelHost) {
    loadError.value = true;
    return;
  }
  canvasRef = canvas;

  try {
    const { SpaceBuilderScene } = await import('./scene/SpaceBuilderScene');
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });

    prepareSpaceBuilderGpu();
    const scene = new SpaceBuilderScene({
      canvas,
      labelHost,
      onSnapshot: (next) => {
        snapshot.value = next;
        updateSeatsInvalid(next);
      },
    });
    scene.pause();
    registerSpaceBuilderGpu(scene);
    sceneRef.value = scene;

    scene.setArea({ x: 0, z: 0, width: 8.4, depth: 6.6, angle: -0.08 });
    scene.setOptions({
      ...SEED_OPTIONS,
      blocks: { ...SEED_OPTIONS.blocks },
    });
    // Handles stay visible for context but aren't draggable — hover shows a
    // forbidden cursor. Look down from near-top so the whole packed area reads clearly.
    scene.setCameraAngles(undefined, Math.PI * 0.22);

    ready.value = true;
    requestAnimationFrame(() => {
      scene.forceResize();
      requestAnimationFrame(() => {
        scene.forceResize();
        // Nudge the area up-screen so the capacity tag clears the hint text below.
        scene.panByScreenDelta(0, -36);
      });
    });

    void scene.loadChair().then(() => {
      chairsReady = true;
      if (inView) startAutoplay();
    }).catch((error) => {
      console.debug('Parameters scene chair failed to load', error);
    });

    const visibilityRoot =
      root.closest<HTMLElement>('article.technical-drawing-stack > * > section') ?? root;
    const stack = visibilityRoot.closest('article.technical-drawing-stack');
    observer = new IntersectionObserver(
      (entries) => {
        const visible = Boolean(entries[0]?.isIntersecting);
        inView = visible;
        if (!visible) {
          releaseSpaceBuilderGpu(scene);
          autoplayToken += 1;
          demoPlaying.value = false;
          return;
        }
        claimSpaceBuilderGpu(scene);
        startAutoplay();
      },
      { root: stack, threshold: 0.45 },
    );
    observer.observe(visibilityRoot);

    // Hold the demo still while the note dialog covers this page.
    stopNoteWatch = watchDrawingNote(visibilityRoot, (open) => {
      if (open) {
        autoplayToken += 1;
        demoPlaying.value = false;
        scene.pause();
      } else {
        scene.resume();
        startAutoplay();
      }
    });

    onReplayRequest(root, restartDemo);
    root.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('wheel', onWheel, { passive: false });
    root.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  } catch (error) {
    console.debug('Parameters scene failed to start', error);
    loadError.value = true;
  }
});

onBeforeUnmount(() => {
  observer?.disconnect();
  stopNoteWatch?.();
  stopNoteWatch = null;
  autoplayToken += 1;
  if (savedTimer) clearTimeout(savedTimer);
  if (sceneRef.value) releaseSpaceBuilderGpu(sceneRef.value);
  sceneRef.value?.dispose();
  sceneRef.value = null;
  canvasRef = null;
  rootRef.value?.removeEventListener('pointerdown', onPointerDown);
  rootRef.value?.removeEventListener('wheel', onWheel);
  rootRef.value?.removeEventListener('contextmenu', onContextMenu);
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('pointercancel', onPointerUp);
});
</script>

<template>
  <div
    ref="rootRef"
    class="parameters-scene-app"
    tabindex="0"
    :data-ready="ready ? 'true' : 'false'"
    aria-label="Edit Parameters demo — autoplaying slider demo, orbit to look around, edit the Options sidebar to take over"
  >
    <div class="viewport">
      <canvas data-scene-canvas class="scene-canvas" aria-label="Populated SelectArea reacting to Options" />
      <div data-label-host class="label-host" />

      <div
        v-if="!ready || loadError"
        class="boot-cover"
        :class="{ error: loadError }"
        :role="loadError ? 'status' : undefined"
      >
        <span v-if="!loadError" class="spinner" aria-hidden="true" />
        <span>{{ loadError ? '3D scene unavailable' : 'Loading SelectArea…' }}</span>
      </div>

      <p v-if="demoPlaying" class="flash" role="status">{{ autoplayStartedToast().action }}</p>

      <div v-if="ready && !loadError" class="controls">
        <button type="button" class="restart-btn" @click="restartDemo">
          Restart
        </button>
        <p class="hint">
          Orbit to look around · edit the sidebar to take over
        </p>
      </div>
    </div>

    <aside class="sidebar" aria-label="Options" @pointerdown="yieldToUser" @focusin="yieldToUser">
      <header class="sidebar-header">
        <h3 class="sidebar-title">Options</h3>
      </header>
      <div class="sidebar-body">
        <OptionsPanel
          :snapshot="snapshot"
          :seats-invalid="seatsInvalid"
          :show-layouts="true"
          :open-layouts="false"
          @seats="onSeats"
          @block-width="onBlockWidth"
          @block-height="onBlockHeight"
          @distance-x="onDistanceX"
          @distance-z="onDistanceZ"
          @aisle="onAisle"
          @offset="onOffset"
          @angle="onAngle"
          @inner-diameter="onInnerDiameter"
          @style="onStyle"
        />
      </div>
      <footer class="sidebar-footer">
        <button type="button" class="action action--muted" @click="resetOptions">
          Reset
        </button>
        <button
          type="button"
          class="action action--primary action--save"
          :disabled="!snapshot?.valid"
          @click="saveArrangement"
        >
          {{ saved ? 'Saved' : 'Save' }}
        </button>
      </footer>
    </aside>
  </div>
</template>

<style lang="scss" scoped>
$visrez-brand: #89ab24;
$light-grey: #565656;
$nav-sidebar-bg: #323232;
$buttons-ui: #6c757d;
$scene-bg: #212121;

.parameters-scene-app {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) min(17.5rem, 42vw);
  color: #f3f3f4;
  background: $scene-bg;
  font-family: 'Open Sans', var(--font-poppins, system-ui, sans-serif);
  color-scheme: only dark;
  outline: none;
  touch-action: none;

  &:focus-visible {
    box-shadow: inset 0 0 0 2px $visrez-brand;
  }

  // Narrow-but-landscape: the sidebar's vw-based width no longer tracks the
  // shrunk frame. Declared before the portrait override below so portrait's
  // full stacked layout still wins once the sheet flips orientation.
  @container (max-width: 34rem) {
    grid-template-columns: minmax(0, 1fr) min(11rem, 68cqw);
  }

  @container technical-drawing (orientation: portrait) {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) auto;
  }
}

.viewport {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: $scene-bg;
}

.scene-canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
}

.label-host {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.boot-cover {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 0.65rem;
  background: $scene-bg;
  color: #adb5bd;
  font: 0.85rem/1.3 system-ui, sans-serif;

  &.error {
    color: #f1aeb5;
  }
}

.spinner {
  width: 1.6rem;
  height: 1.6rem;
  border: 3px solid $visrez-brand;
  border-top-color: transparent;
  border-radius: 50%;
  animation: params-spin 0.8s linear infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
    border-color: $visrez-brand;
  }
}

.flash {
  position: absolute;
  top: 0.55rem;
  left: 50%;
  z-index: 2;
  translate: -50% 0;
  margin: 0;
  padding: 0.3rem 0.65rem;
  border-radius: 0.25rem;
  background: rgba(26, 179, 148, 0.92);
  color: #fff;
  font: 700 0.72rem/1.3 var(--font-poppins, system-ui, sans-serif);
  white-space: nowrap;
  pointer-events: none;
}

.controls {
  position: absolute;
  left: 50%;
  bottom: 0.55rem;
  z-index: 2;
  translate: -50% 0;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 0.35rem 0.5rem;
  // Narrow frames can't fit the button + full hint on one line — wrap
  // instead of letting the row force this centered box off both edges.
  max-width: calc(100% - 1rem);
}

.restart-btn {
  padding: 0.28rem 0.7rem;
  border: 1px solid $visrez-brand;
  border-radius: 0.25rem;
  background: color-mix(in oklab, $visrez-brand 25%, #171717);
  color: #f4ffe8;
  font: 700 0.68rem/1.3 var(--font-poppins, system-ui, sans-serif);
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    background: color-mix(in oklab, $visrez-brand 40%, #171717);
  }
}

.hint {
  margin: 0;
  padding: 0.25rem 0.55rem;
  border-radius: 0.25rem;
  background: rgba(18, 22, 18, 0.72);
  color: #e8e4dc;
  font: 0.62rem/1.3 var(--font-poppins, system-ui, sans-serif);
  letter-spacing: 0.02em;
  pointer-events: none;
  text-align: center;
}

.sidebar {
  position: relative;
  min-height: 0;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: $nav-sidebar-bg;
  box-shadow: -4px 0 16px rgba(0, 0, 0, 0.4);

  @container technical-drawing (orientation: portrait) {
    // Not min(46cqh, 100%): that 100% is a percentage of this item's own
    // grid row, which the row's `auto` track derives from this max-height —
    // a circular percentage Chrome resolves by dropping the clamp entirely,
    // so the sidebar (and the space it left the 1fr viewport row) collapsed.
    max-height: 46cqh;
    box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.4);
  }
}

.sidebar-header {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  padding: 0.45rem 0.65rem;
  border-bottom: 1px solid $light-grey;
}

.sidebar-title {
  margin: 0;
  flex: 1;
  font-size: 0.95rem;
  font-weight: 600;
}

.sidebar-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 0.75rem;
  scrollbar-width: thin;
}

.sidebar-footer {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.45rem 0.75rem;
  background: $nav-sidebar-bg;
  border-top: 1px solid $light-grey;
}

.action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  padding: 0.32rem 0.65rem;
  border: 1px solid transparent;
  border-radius: 3px;
  font: inherit;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.action--primary {
  background: $visrez-brand;
  border-color: $visrez-brand;
  color: #fff;

  &:hover:not(:disabled) {
    filter: brightness(0.95);
  }
}

.action--muted {
  flex: 1;
  background: $buttons-ui;
  border-color: $buttons-ui;
  color: #fff;
}

.action--save {
  flex: 1.4;
  padding-block: 0.55rem;
  font-size: 0.9rem;
}
</style>
