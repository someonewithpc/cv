<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';

import { watchDrawingNote } from '@/client/drawingNote';
import { onAutoplayCommand, reducedMotion, reportAutoplayState } from '@/client/autoplayStatus';
import { documentGate, watchPageActive } from '@/client/frontPage';

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
  updatePinch,
  type PinchState,
  type ScreenPoint,
} from './scene/sceneViewportGestures';
import type { SpaceBuilderScene } from './scene/SpaceBuilderScene';

/** Radians/second — a full lap takes ~25s, gentle enough not to be nauseating. */
const ORBIT_SPEED = 0.25;

const rootRef = ref<HTMLElement | null>(null);
const ready = ref(false);
const loadError = ref(false);
const playing = ref(false);
/** The math card's text. Set only when a shown number changes, so an orbit frame that
 * moves the camera less than a degree or a centimetre re-renders nothing. */
const readout = ref<{ theta: string; r: string; offset: string } | null>(null);

const sceneRef = shallowRef<SpaceBuilderScene | null>(null);
let stopPageWatch: (() => void) | null = null;
let stopNoteWatch: (() => void) | null = null;
let stopClockWatch: (() => void) | null = null;
const activePointers = new Map<number, ScreenPoint>();
let pinch: PinchState | null = null;

let inView = false;
let noteOpen = false;
let orbitRaf = 0;
let lastFrameTime: number | null = null;

function syncMetrics() {
  const metrics = sceneRef.value?.getTagMetrics() ?? null;
  const next = metrics && {
    theta: formatDeg(metrics.theta),
    r: formatMeters(metrics.r),
    offset: formatMeters(metrics.offset),
  };
  const shown = readout.value;
  if (
    shown === next ||
    (shown && next && shown.theta === next.theta && shown.r === next.r && shown.offset === next.offset)
  ) {
    return;
  }
  readout.value = next;
}

function orbitStep(now: number) {
  const scene = sceneRef.value;
  if (!scene) return;
  if (lastFrameTime === null) lastFrameTime = now;
  const dt = Math.min(0.1, (now - lastFrameTime) / 1000);
  lastFrameTime = now;
  scene.orbitBy(ORBIT_SPEED * dt);
  syncMetrics();
  orbitRaf = requestAnimationFrame(orbitStep);
}

function startOrbitLoop() {
  if (orbitRaf) return;
  lastFrameTime = null;
  orbitRaf = requestAnimationFrame(orbitStep);
}

function stopOrbitLoop() {
  if (orbitRaf) cancelAnimationFrame(orbitRaf);
  orbitRaf = 0;
  lastFrameTime = null;
}

function applyOrbitState() {
  if (playing.value && inView && !noteOpen && documentGate().running) startOrbitLoop();
  else stopOrbitLoop();
  // Drives the sheet's status chip (TechnicalDrawing/Page.astro).
  reportAutoplayState(rootRef.value, playing.value ? 'playing' : reducedMotion(rootRef.value) ? 'paused' : 'user');
}

function togglePlay() {
  playing.value = !playing.value;
  applyOrbitState();
}

/** A manual drag means the visitor wants direct control — stay paused after. */
function pauseForManualControl() {
  if (!playing.value) return;
  playing.value = false;
  applyOrbitState();
}

function onPointerDown(event: PointerEvent) {
  const scene = sceneRef.value;
  const root = rootRef.value;
  if (!scene || !root) return;
  if (event.target instanceof Element && event.target.closest('button, a')) return;

  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  trySetPointerCapture(event.currentTarget, event.pointerId);

  if (activePointers.size >= 2) {
    const [a, b] = activePointers.values();
    if (a && b) pinch = beginPinch(scene, a, b);
    pauseForManualControl();
    return;
  }

  if (event.button === 2 || (event.button === 0 && (event.shiftKey || event.ctrlKey || event.metaKey))) {
    scene.beginPan(event.clientX, event.clientY);
    return;
  }
  if (event.button !== 0) return;
  pauseForManualControl();
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
    if (a && b) {
      updatePinch(scene, pinch, a, b);
      syncMetrics();
    }
    return;
  }

  if (scene.isPanning()) {
    scene.pan(event.clientX, event.clientY);
    syncMetrics();
    return;
  }
  if (scene.isOrbiting()) {
    scene.orbit(event.clientX, event.clientY);
    syncMetrics();
  }
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
  if (!scene) return;
  applyWheelZoom(scene, event);
  syncMetrics();
}

function onContextMenu(event: Event) {
  event.preventDefault();
}

function formatDeg(theta: number) {
  const deg = ((theta * 180) / Math.PI) % 360;
  return `${Math.round(deg < 0 ? deg + 360 : deg)}°`;
}

function formatMeters(v: number) {
  return `${v.toFixed(2)}m`;
}

const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

function onReduceChange() {
  if (reducedMotion(rootRef.value)) pauseForManualControl();
  else applyOrbitState();
}

onMounted(async () => {
  playing.value = !reducedMotion(rootRef.value);
  reduceQuery.addEventListener('change', onReduceChange);

  const root = rootRef.value;
  const canvas = root?.querySelector<HTMLCanvasElement>('[data-scene-canvas]');
  const labelHost = root?.querySelector<HTMLElement>('[data-label-host]');
  if (!root || !canvas || !labelHost) {
    loadError.value = true;
    return;
  }

  try {
    const { SpaceBuilderScene } = await import('./scene/SpaceBuilderScene');
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });

    prepareSpaceBuilderGpu();
    const scene = new SpaceBuilderScene({ canvas, labelHost });
    scene.pause();
    registerSpaceBuilderGpu(scene);
    sceneRef.value = scene;

    scene.setArea({ x: 0, z: 0, width: 8.6, depth: 6.8, angle: 0.18 });
    scene.setOptions({
      style: 'grid',
      seats: 0,
      distanceX: 0.2,
      distanceZ: 0.35,
      aisle: 0.8,
      blocks: { width: 0, height: 0 },
    });

    ready.value = true;
    requestAnimationFrame(() => {
      scene.forceResize();
      requestAnimationFrame(() => {
        scene.forceResize();
        syncMetrics();
      });
    });

    void scene.loadChair().then(() => {
      syncMetrics();
    }).catch((error) => {
      console.debug('Badge scene chair failed to load', error);
    });

    const visibilityRoot =
      root.closest<HTMLElement>('article.technical-drawing-stack > * > section') ?? root;
    stopPageWatch = watchPageActive(visibilityRoot, (active, reasons) => {
      inView = active;
      if (!active) {
        releaseSpaceBuilderGpu(scene, reasons);
        applyOrbitState();
        return;
      }
      claimSpaceBuilderGpu(scene);
      syncMetrics();
      applyOrbitState();
    });

    // Hold the demo still while the note dialog covers this page.
    stopNoteWatch = watchDrawingNote(visibilityRoot, (open) => {
      noteOpen = open;
      applyOrbitState();
      if (open) scene.pause();
      else scene.resume();
    });
    stopClockWatch = documentGate().onChange(() => applyOrbitState());

    onAutoplayCommand(root, (command) => {
      // Reset under reduced motion leaves the orbit still, as the deck says.
      if (command === 'pause' || reducedMotion(root)) pauseForManualControl();
      else if (!playing.value) togglePlay();
    });
    root.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('wheel', onWheel, { passive: false });
    root.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  } catch (error) {
    console.debug('Badge scene failed to start', error);
    loadError.value = true;
  }
});

onBeforeUnmount(() => {
  reduceQuery.removeEventListener('change', onReduceChange);
  stopClockWatch?.();
  stopClockWatch = null;
  stopPageWatch?.();
  stopPageWatch = null;
  stopNoteWatch?.();
  stopNoteWatch = null;
  stopOrbitLoop();
  if (sceneRef.value) releaseSpaceBuilderGpu(sceneRef.value);
  sceneRef.value?.dispose();
  sceneRef.value = null;
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
    class="badge-scene-app"
    tabindex="0"
    :data-ready="ready ? 'true' : 'false'"
    aria-label="Capacity Badge demo — auto-orbiting to show the tag tracking the camera; drag to take over"
  >
    <canvas data-scene-canvas class="scene-canvas" aria-label="SelectArea with a camera-relative capacity tag" />
    <div data-label-host class="label-host" />

    <div
      v-if="!ready || loadError"
      class="boot-cover"
      :class="{ error: loadError }"
      :role="loadError ? 'status' : undefined"
    >
      <span v-if="!loadError" class="spinner" aria-hidden="true" />
      <span>{{ loadError ? '3D scene unavailable' : 'Loading badge…' }}</span>
    </div>

    <figure v-if="ready && !loadError" class="fail-card">
      <figcaption><span class="badge">Discarded</span> World −Z offset</figcaption>
      <div class="fail-viewport" aria-hidden="true">
        <div class="fail-area">
          <span class="fail-tag">48 seats</span>
        </div>
      </div>
      <p class="fail-note">Buried under the box on orbit — not what shipped.</p>
    </figure>

    <div v-if="ready && !loadError && readout" class="math-card">
      <p class="math-title">offset = r + 0.95m</p>
      <dl>
        <div><dt>θ</dt><dd>{{ readout.theta }}</dd></div>
        <div><dt>r</dt><dd>{{ readout.r }}</dd></div>
        <div><dt>offset</dt><dd>{{ readout.offset }}</dd></div>
      </dl>
    </div>

    <div v-if="ready && !loadError" class="controls">
      <button type="button" class="play-toggle" :aria-pressed="playing" @click="togglePlay">
        {{ playing ? 'Pause' : 'Play' }}
      </button>
      <p class="hint">{{ playing ? 'Auto-orbiting · drag to take over' : 'Drag to orbit' }}</p>
    </div>
  </div>
</template>

<style lang="scss" scoped>
$visrez-brand: #89ab24;
$scene-bg: #212121;

.badge-scene-app {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: $scene-bg;
  color: #f3f3f4;
  font-family: 'Open Sans', var(--font-poppins, system-ui, sans-serif);
  color-scheme: only dark;
  outline: none;
  touch-action: none;

  &:focus-visible {
    box-shadow: inset 0 0 0 2px $visrez-brand;
  }
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
  font: 0.875rem/1.3 system-ui, sans-serif;

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
  animation: badge-spin 0.8s linear infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
    border-color: $visrez-brand;
  }
}

.controls {
  position: absolute;
  left: 50%;
  bottom: 0.55rem;
  z-index: 2;
  translate: -50% 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.play-toggle {
  padding: 0.28rem 0.7rem;
  border: 1px solid $visrez-brand;
  border-radius: 0.25rem;
  background: color-mix(in oklab, $visrez-brand 25%, #171717);
  color: #f4ffe8;
  font: 700 0.625rem/1.3 var(--font-poppins, system-ui, sans-serif);
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    background: color-mix(in oklab, $visrez-brand 40%, #171717);
  }

  &[aria-pressed='true'] {
    background: $visrez-brand;
    color: #142008;
  }
}

.hint {
  margin: 0;
  padding: 0.25rem 0.55rem;
  border-radius: 0.25rem;
  background: rgba(18, 22, 18, 0.72);
  color: #e8e4dc;
  font: 0.625rem/1.3 var(--font-poppins, system-ui, sans-serif);
  letter-spacing: 0.02em;
  pointer-events: none;
  white-space: nowrap;
}

.fail-card {
  position: absolute;
  top: 0.65rem;
  left: 0.65rem;
  z-index: 2;
  margin: 0;
  width: 8rem;
  padding: 0.4rem 0.45rem 0.5rem;
  border: 1px solid #565656;
  border-radius: 0.3rem;
  background: rgba(50, 50, 50, 0.88);
  backdrop-filter: blur(2px);
  color: #f3f3f4;
  pointer-events: none;

  figcaption {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    margin-bottom: 0.35rem;
    font-size: 0.625rem;
    font-weight: 600;
    line-height: 1.2;
  }

  .badge {
    display: inline-block;
    padding: 0.04rem 0.3rem;
    border-radius: 0.2rem;
    background: color-mix(in oklab, #f76d65 75%, #111);
    color: #fff5f4;
    font-size: 0.625rem;
    font-weight: 800;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    white-space: nowrap;
  }
}

.fail-viewport {
  position: relative;
  height: 3.4rem;
  border-radius: 0.2rem;
  background: #171717;
  border: 1px solid #444;
  overflow: hidden;
}

.fail-area {
  position: absolute;
  left: 20%;
  top: 22%;
  width: 54%;
  height: 48%;
  rotate: -14deg;
  background: color-mix(in oklab, #89ab22 40%, transparent);
  border: 1.5px solid #6f8f1c;
  border-radius: 0.12rem;
}

.fail-tag {
  position: absolute;
  left: 50%;
  top: 52%;
  translate: -50% 0;
  padding: 0 0.3rem;
  border-radius: 8px;
  border: 1.5px solid rgba(162, 206, 59, 0.7);
  background: rgba(25, 41, 21, 0.85);
  color: #fff;
  font-size: 0.625rem;
  font-weight: 800;
  white-space: nowrap;
  opacity: 0.55;
  filter: blur(0.3px);
}

.fail-note {
  margin: 0.3rem 0 0;
  font-size: 0.625rem;
  line-height: 1.35;
  color: #adb5bd;
}

.math-card {
  position: absolute;
  top: 0.65rem;
  right: 0.65rem;
  z-index: 2;
  padding: 0.4rem 0.55rem 0.45rem;
  border: 1px solid #565656;
  border-radius: 0.3rem;
  background: rgba(50, 50, 50, 0.88);
  backdrop-filter: blur(2px);
  color: #f3f3f4;
  pointer-events: none;

  .math-title {
    margin: 0 0 0.3rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0.01em;
    white-space: nowrap;
    color: $visrez-brand;
  }

  dl {
    display: flex;
    gap: 0.55rem;
    margin: 0;
  }

  dl > div {
    display: grid;
    justify-items: center;
    gap: 0.1rem;
    // Fixed width per field — tabular-nums alone still reflows when the digit
    // *count* changes (e.g. "5°" vs "355°", "3.1m" vs "12.3m").
    width: 3rem;
  }

  dl > div:first-child {
    width: 2.2rem;
  }

  dt {
    font-size: 0.625rem;
    color: #adb5bd;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  dd {
    margin: 0;
    font-size: 0.625rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: #a2ce3b;
    white-space: nowrap;
    text-align: center;
  }
}

@keyframes badge-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
