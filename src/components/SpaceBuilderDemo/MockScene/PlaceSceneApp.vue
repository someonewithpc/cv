<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

import { watchDrawingNote } from '@/client/drawingNote';
import { watchPageActive } from '@/client/frontPage';

import type { SpaceBuilderScene } from './scene/SpaceBuilderScene';
import {
  claimSpaceBuilderGpu,
  prepareSpaceBuilderGpu,
  registerSpaceBuilderGpu,
  releaseSpaceBuilderGpu,
} from './scene/spaceBuilderGpu';
import { SceneArrowAnnotations } from './scene/SceneArrowAnnotations';
import {
  applyWheelZoom,
  beginPinch,
  handleScreenSlop,
  trySetPointerCapture,
  updateHandleHoverCursor,
  updatePinch,
  type PinchState,
  type ScreenPoint,
} from './scene/sceneViewportGestures';

const rootRef = ref<HTMLElement | null>(null);
const ready = ref(false);
const loadError = ref(false);

let sceneRef: SpaceBuilderScene | null = null;
let canvasRef: HTMLCanvasElement | null = null;
let arrows: SceneArrowAnnotations | null = null;
let stopPageWatch: (() => void) | null = null;
let stopNoteWatch: (() => void) | null = null;
const activePointers = new Map<number, ScreenPoint>();
let pinch: PinchState | null = null;

function onPointerDown(event: PointerEvent) {
  const scene = sceneRef;
  const root = rootRef.value;
  if (!scene || !root) return;
  if (event.target instanceof Element && event.target.closest('button, a, input')) return;

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

  const handle = scene.pickHandle(event.clientX, event.clientY, {
    screenSlop: handleScreenSlop(event),
  });
  if (handle) {
    scene.beginHandleDrag(handle, event.clientX, event.clientY);
    if (canvasRef) canvasRef.style.cursor = 'grabbing';
    return;
  }
  scene.beginOrbit(event.clientX, event.clientY);
}

function onPointerMove(event: PointerEvent) {
  const scene = sceneRef;
  if (!scene) return;

  if (activePointers.has(event.pointerId)) {
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  }

  if (pinch && activePointers.size >= 2) {
    const [a, b] = activePointers.values();
    if (a && b) {
      updatePinch(scene, pinch, a, b);
      arrows?.sync();
    }
    return;
  }

  if (scene.isDraggingHandle()) {
    scene.updateHandleDrag(event.clientX, event.clientY, { snap: event.altKey });
    arrows?.sync();
    return;
  }
  // Drive from scene gesture flags — touch moves can report buttons === 0 without capture.
  if (scene.isPanning()) {
    scene.pan(event.clientX, event.clientY);
    return;
  }
  if (scene.isOrbiting()) {
    scene.orbit(event.clientX, event.clientY);
    return;
  }
  if (canvasRef) updateHandleHoverCursor(scene, canvasRef, event.clientX, event.clientY, 'grab');
}

function onPointerUp(event: PointerEvent) {
  const scene = sceneRef;
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

  if (scene.isDraggingHandle()) {
    scene.endHandleDrag();
    arrows?.sync();
    if (canvasRef) updateHandleHoverCursor(scene, canvasRef, event.clientX, event.clientY, 'grab');
    return;
  }
  scene.endPan();
  scene.endOrbit();
}

function onWheel(event: WheelEvent) {
  const scene = sceneRef;
  if (!scene) return;
  applyWheelZoom(scene, event);
}

function onContextMenu(event: Event) {
  event.preventDefault();
}

onMounted(async () => {
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
      onSnapshot: () => {
        arrows?.sync();
      },
      // A lost context leaves a blank canvas; show the sheet's fallback until it comes back.
      onContextLost: (lost) => {
        loadError.value = lost;
      },
    });
    scene.pause();
    registerSpaceBuilderGpu(scene);
    sceneRef = scene;

    arrows = new SceneArrowAnnotations(scene);
    arrows.set([
      {
        handle: 'topRight',
        text: 'Corner / edge resize',
        length: 1.85,
        direction: { x: 1, z: -0.55 },
      },
      {
        handle: 'center',
        text: 'Pink center · move',
        length: 1.55,
        direction: { x: 1.1, z: 0.35 },
      },
      {
        handle: 'rotate',
        text: 'Green rotate',
        length: 1.65,
        direction: { x: -0.25, z: -1 },
      },
      {
        // Tip the fill plane itself — not an edge handle.
        localTip: { x: 0.55, z: 1.15 },
        text: 'Validity tint on the plane',
        length: 1.75,
        direction: { x: 0.35, z: 1 },
      },
    ]);

    // Mid-Add: grid fill already inferred into a drawn SelectArea.
    scene.setArea({
      x: 0,
      z: 0,
      width: 6.2,
      depth: 5.0,
      angle: -0.12,
    });
    scene.setOptions({
      style: 'grid',
      seats: 0,
      distanceX: 0.2,
      distanceZ: 0.35,
      aisle: 0.9,
      blocks: { width: 0, height: 0 },
    });
    // No chairs on this page — it's about the empty SelectArea and its handles.
    scene.setTagSuppressed(true);

    ready.value = true;
    requestAnimationFrame(() => {
      scene.forceResize();
      requestAnimationFrame(() => {
        scene.forceResize();
        arrows?.sync();
      });
    });

    const visibilityRoot =
      root.closest<HTMLElement>('article.technical-drawing-stack > * > section')
      ?? root;
    stopPageWatch = watchPageActive(visibilityRoot, (active, reasons) => {
      if (!active) {
        releaseSpaceBuilderGpu(scene, reasons);
        return;
      }
      claimSpaceBuilderGpu(scene);
      arrows?.sync();
    });

    // Hold the demo still while the note dialog covers this page.
    stopNoteWatch = watchDrawingNote(visibilityRoot, (open) => {
      const scene = sceneRef;
      if (!scene) return;
      if (open) {
        scene.pause();
      } else {
        scene.resume();
        arrows?.sync();
      }
    });

    root.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('wheel', onWheel, { passive: false });
    root.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  } catch (error) {
    console.debug('Place scene failed to start', error);
    loadError.value = true;
  }
});

onBeforeUnmount(() => {
  stopPageWatch?.();
  stopPageWatch = null;
  stopNoteWatch?.();
  stopNoteWatch = null;
  arrows?.dispose();
  arrows = null;
  if (sceneRef) releaseSpaceBuilderGpu(sceneRef);
  sceneRef?.dispose();
  sceneRef = null;
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
    class="place-scene-app"
    tabindex="0"
    :data-ready="ready ? 'true' : 'false'"
    aria-label="SelectArea demo — orbit and resize the grab handles"
  >
    <canvas data-scene-canvas class="scene-canvas" aria-label="SelectArea grab handles in 3D" />
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

    <p v-if="ready && !loadError" class="hint">
      Drag handles to edit · orbit · zoom · pan
    </p>
  </div>
</template>

<style lang="scss">
.place-scene-app {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: #212121;
  color-scheme: only dark;
  outline: none;
  touch-action: none;

  &:focus-visible {
    box-shadow: inset 0 0 0 2px #89ab24;
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
    background: #212121;
    color: #adb5bd;
    font: 0.875rem/1.3 system-ui, sans-serif;

    &.error {
      color: #f1aeb5;
    }
  }

  .spinner {
    width: 1.6rem;
    height: 1.6rem;
    border: 3px solid #89ab24;
    border-top-color: transparent;
    border-radius: 50%;
    animation: loading-spin 0.8s linear infinite;

    @media (prefers-reduced-motion: reduce) {
      animation: none;
      border-color: #89ab24;
    }
  }

  .hint {
    position: absolute;
    left: 50%;
    bottom: 0.55rem;
    z-index: 2;
    translate: -50% 0;
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
}
</style>

<style lang="scss">
// CSS2D labels live under .space-builder-labels (appended to label-host).
.sb-scene-anno {
  pointer-events: none;
  translate: 0 -0.35rem;
}

.sb-scene-anno__text {
  display: inline-block;
  padding: 0.18rem 0.45rem 0.22rem;
  border-radius: 0.25rem;
  border-bottom: 0.09rem solid color-mix(in oklab, #f4f0ea 70%, transparent);
  background: color-mix(in oklab, #3a3d42 72%, transparent);
  color: #f4f0ea;
  font-family: sans-serif;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  white-space: nowrap;
  line-height: 1.15;
  box-shadow: 0 1px 2px color-mix(in oklab, #000 35%, transparent);
}

.space-builder-tag {
  padding: 0 0.45rem;
  border-radius: 10px;
  border: 2px solid rgba(162, 206, 59, 0.85);
  background: rgba(25, 41, 21, 0.85);
  color: #fff;
  font-family: 'Open Sans', var(--font-poppins, system-ui, sans-serif);
  font-size: 0.875rem;
  font-weight: 800;
  white-space: nowrap;
  pointer-events: none;
}
</style>
