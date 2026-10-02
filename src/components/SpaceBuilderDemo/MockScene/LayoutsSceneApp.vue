<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';

import { watchDrawingNote } from '@/client/drawingNote';
import { onAutoplayCommand, reducedMotion, reportAutoplayState } from '@/client/autoplayStatus';
import { demoGate, type DemoGate } from '@/client/frontPage';

import { autoplayStartedToast } from './AutoPlayController';
import { LAYOUT_ICONS } from './layoutIcons';
import { LAYOUT_LABELS, LAYOUT_STYLES, type LayoutOptions, type LayoutStyle } from './scene/layoutEngine';
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
  blocks: { width: 0, height: 0 },
  distanceX: 0.2,
  distanceZ: 0.35,
  aisle: 0.8,
  offset: 0.3,
  angle: Math.PI / 8,
  innerDiameter: 0,
};

const HOLD_MS = 1700;
const rootRef = ref<HTMLElement | null>(null);
const ready = ref(false);
const loadError = ref(false);
const snapshot = ref<SceneSnapshot | null>(null);
const demoPlaying = ref(false);

const sceneRef = shallowRef<SpaceBuilderScene | null>(null);
let stopPageWatch: (() => void) | null = null;
let stopNoteWatch: (() => void) | null = null;
let canvasRef: HTMLCanvasElement | null = null;
const activePointers = new Map<number, ScreenPoint>();
let pinch: PinchState | null = null;

let inView = false;
let userControl = false;
let chairsReady = false;
let chairFailed = false;
let autoplayToken = 0;
/** Off screen, under another page or in a hidden tab, the walkthrough's waits hold it where it stands. */
let pageGate: DemoGate | null = null;

const activeStyle = computed(() => snapshot.value?.options.style ?? 'grid');

function wait(ms: number) {
  return pageGate ? pageGate.wait(ms) : new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function runAutoplay() {
  const token = autoplayToken;
  demoPlaying.value = true;
  let i = 0;
  while (token === autoplayToken) {
    const scene = sceneRef.value;
    if (!scene) break;
    scene.setStyle(LAYOUT_STYLES[i % LAYOUT_STYLES.length]);
    i += 1;
    await wait(HOLD_MS);
  }
  demoPlaying.value = false;
}

function startAutoplay() {
  if (reducedMotion(rootRef.value)) {
    autoplayToken += 1;
    demoPlaying.value = false;
    reportAutoplayState(rootRef.value, 'paused');
    return;
  }
  if (userControl || !chairsReady || !inView) return;
  autoplayToken += 1;
  reportAutoplayState(rootRef.value, 'playing');
  void runAutoplay();
}

function restartDemo() {
  userControl = false;
  void sceneRef.value?.resetCamera();
  startAutoplay();
}

// Picking a style is deliberate, so the visitor keeps control until they ask for
// the walkthrough back from the sheet's status chip.
function yieldToUser() {
  autoplayToken += 1;
  demoPlaying.value = false;
  userControl = true;
  reportAutoplayState(rootRef.value, 'user');
}

function isChrome(target: EventTarget | null) {
  return target instanceof Element && target.closest('.rail, button');
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

function setStyle(style: LayoutStyle) {
  yieldToUser();
  sceneRef.value?.setStyle(style);
}

const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

function onReduceChange() {
  if (reducedMotion(rootRef.value) || !demoPlaying.value) startAutoplay();
}

onMounted(async () => {
  reduceQuery.addEventListener('change', onReduceChange);

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
      },
      // A lost context leaves a blank canvas; show the sheet's fallback until it comes back.
      onContextLost: (lost) => {
        loadError.value = lost || chairFailed;
        if (!lost) startAutoplay();
        else {
          autoplayToken += 1;
          demoPlaying.value = false;
        }
      },
    });
    scene.pause();
    registerSpaceBuilderGpu(scene);
    sceneRef.value = scene;

    scene.setArea({ x: 0, z: 0, width: 7.4, depth: 5.6, angle: 0 });
    scene.setOptions({
      ...SEED_OPTIONS,
      blocks: { ...SEED_OPTIONS.blocks },
    });
    // Handles stay visible for context but aren't draggable — hover shows a
    // forbidden cursor.

    ready.value = true;
    requestAnimationFrame(() => {
      scene.forceResize();
      requestAnimationFrame(() => scene.forceResize());
    });

    void scene.loadChair().then(() => {
      chairsReady = true;
      if (inView) startAutoplay();
    }).catch((error) => {
      console.debug('Layouts scene chair failed to load', error);
      chairFailed = true;
      loadError.value = true;
    });

    const visibilityRoot =
      root.closest<HTMLElement>('article.technical-drawing-stack > * > section') ?? root;
    const gate = demoGate(visibilityRoot);
    pageGate = gate;
    gate.onChange((active, reasons) => {
      inView = active;
      if (!active) {
        releaseSpaceBuilderGpu(scene, reasons);
        return;
      }
      claimSpaceBuilderGpu(scene);
      if (!demoPlaying.value) startAutoplay();
    });
    stopPageWatch = () => gate.dispose();

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

    onAutoplayCommand(root, (command) => {
      if (command === 'pause') yieldToUser();
      else restartDemo();
    });
    root.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('wheel', onWheel, { passive: false });
    root.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  } catch (error) {
    console.debug('Layouts scene failed to start', error);
    loadError.value = true;
  }
});

onBeforeUnmount(() => {
  reduceQuery.removeEventListener('change', onReduceChange);
  stopPageWatch?.();
  stopPageWatch = null;
  stopNoteWatch?.();
  stopNoteWatch = null;
  autoplayToken += 1;
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
    class="layouts-scene-app"
    tabindex="0"
    :data-ready="ready ? 'true' : 'false'"
    aria-label="Layout Styles demo — autoplaying through each pack style, pick a chip to take over"
  >
    <div class="viewport">
      <canvas data-scene-canvas class="scene-canvas" aria-label="SelectArea with switchable layout styles" />
      <div data-label-host class="label-host" />

      <div
        v-if="!ready || loadError"
        class="boot-cover"
        :class="{ error: loadError }"
        :role="loadError ? 'status' : undefined"
      >
        <span v-if="!loadError" class="spinner" aria-hidden="true" />
        <span>{{ loadError ? '3D scene unavailable' : 'Loading layouts…' }}</span>
      </div>

      <p v-if="demoPlaying" class="flash" role="status">{{ autoplayStartedToast().action }}</p>

      <p v-if="ready && !loadError" class="hint">
        Orbit to look around · pick a chip to take over
      </p>
    </div>

    <aside class="sidebar" aria-label="Layout styles">
      <header class="sidebar-header">
        <h3 class="sidebar-title">Layout Styles</h3>
      </header>
      <div class="sidebar-body">
        <div class="layouts-grid" role="group" aria-label="Layout styles">
          <button
            v-for="style in LAYOUT_STYLES"
            :key="style"
            type="button"
            class="style-chip"
            :class="{ active: activeStyle === style }"
            @click="setStyle(style)"
          >
            <span class="style-icon">
              <img :src="LAYOUT_ICONS[style]" alt="" width="56" height="56">
            </span>
            <span class="style-label">{{ LAYOUT_LABELS[style] }}</span>
          </button>
        </div>
      </div>
    </aside>
  </div>
</template>

<style lang="scss" scoped>
$visrez-brand: #89ab24;
$nav-sidebar-bg: #323232;
$scene-bg: #212121;

.layouts-scene-app {
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
  animation: loading-spin 0.8s linear infinite;

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
  font: 700 0.75rem/1.3 var(--font-poppins, system-ui, sans-serif);
  white-space: nowrap;
  pointer-events: none;
}

.hint {
  position: absolute;
  left: 50%;
  bottom: 0.55rem;
  z-index: 2;
  translate: -50% 0;
  width: max-content;
  max-width: calc(100% - 1rem);
  margin: 0;
  padding: 0.25rem 0.55rem;
  border-radius: 0.25rem;
  background: rgba(18, 22, 18, 0.72);
  color: #e8e4dc;
  font: 0.625rem/1.3 var(--font-poppins, system-ui, sans-serif);
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
  border-bottom: 1px solid #565656;
}

.sidebar-title {
  margin: 0;
  flex: 1;
  font-size: 1rem;
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

.layouts-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;

  @container (max-width: 34rem) {
    grid-template-columns: minmax(0, 1fr);
  }
}

.style-chip {
  display: flex;
  flex-direction: column;
  padding: 0;
  border: 1px solid #495057;
  border-radius: 0.3rem;
  background: transparent;
  color: #adb5bd;
  cursor: pointer;
  overflow: hidden;
  font: inherit;

  &:hover:not(.active) {
    border-color: #adb5bd;
  }

  &:focus-visible {
    outline: 2px solid $visrez-brand;
    outline-offset: 1px;
  }

  .style-label {
    display: block;
    margin: 0;
    padding: 0.3rem 0.25rem;
    background: #212529;
    text-align: center;
    font-size: 0.75rem;
    font-weight: 700;
    color: #f3f3f4;
  }

  .style-icon {
    display: grid;
    place-items: center;
    padding: 0.55rem 0.35rem 0.7rem;
    background: linear-gradient(59deg, #dee2e6 0%, #adb5bd 100%);
    color: #151515;

    img {
      display: block;
      width: 3rem;
      height: 3rem;
      object-fit: contain;
    }
  }

  &.active {
    border-color: $visrez-brand;

    .style-label {
      background: $visrez-brand;
      color: #fff;
    }
  }
}
</style>
