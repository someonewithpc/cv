<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

import { SceneArrowAnnotations } from './scene/SceneArrowAnnotations';
import type { SpaceBuilderScene } from './scene/SpaceBuilderScene';

const rootRef = ref<HTMLElement | null>(null);
const ready = ref(false);
const loadError = ref(false);

let sceneRef: SpaceBuilderScene | null = null;
let arrows: SceneArrowAnnotations | null = null;
let observer: IntersectionObserver | null = null;

function onPointerDown(event: PointerEvent) {
  const scene = sceneRef;
  const root = rootRef.value;
  if (!scene || !root) return;
  if (event.target instanceof Element && event.target.closest('button, a, input')) return;

  if (event.button === 2 || (event.button === 0 && event.shiftKey)) {
    scene.beginPan(event.clientX, event.clientY);
    return;
  }
  if (event.button !== 0) return;

  const handle = scene.pickHandle(event.clientX, event.clientY);
  if (handle) {
    scene.beginHandleDrag(handle, event.clientX, event.clientY);
    return;
  }
  scene.beginOrbit(event.clientX, event.clientY);
}

function onPointerMove(event: PointerEvent) {
  const scene = sceneRef;
  if (!scene) return;
  if (scene.isDraggingHandle()) {
    scene.updateHandleDrag(event.clientX, event.clientY);
    arrows?.sync();
    return;
  }
  if (scene.isPanning() && event.buttons > 0) {
    scene.pan(event.clientX, event.clientY);
    return;
  }
  if (scene.isOrbiting() && event.buttons > 0) {
    scene.orbit(event.clientX, event.clientY);
  }
}

function onPointerUp() {
  const scene = sceneRef;
  if (!scene) return;
  if (scene.isDraggingHandle()) {
    scene.endHandleDrag();
    arrows?.sync();
    return;
  }
  scene.endPan();
  scene.endOrbit();
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

  try {
    const { SpaceBuilderScene } = await import('./scene/SpaceBuilderScene');
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });

    const scene = new SpaceBuilderScene({
      canvas,
      labelHost,
      onSnapshot: () => {
        arrows?.sync();
      },
    });
    scene.pause();
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
        text: 'Pink center · translate',
        length: 1.55,
        direction: { x: 1.1, z: 0.35 },
      },
      {
        handle: 'rotate',
        text: 'Green rotate · Alt snaps',
        length: 1.65,
        direction: { x: -0.25, z: -1 },
      },
      {
        handle: 'bottom',
        text: 'Validity tint on the plane',
        length: 1.75,
        direction: { x: 0.4, z: 1 },
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

    ready.value = true;
    requestAnimationFrame(() => {
      scene.forceResize();
      requestAnimationFrame(() => {
        scene.forceResize();
        arrows?.sync();
      });
    });

    void scene.loadChair().then(() => {
      arrows?.sync();
    }).catch((error) => {
      console.debug('Place scene chair failed to load', error);
    });

    const visibilityRoot =
      root.closest<HTMLElement>('article.technical-drawing-stack > section')
      ?? root;
    const stack = visibilityRoot.closest('article.technical-drawing-stack');
    observer = new IntersectionObserver(
      (entries) => {
        const visible = Boolean(entries[0]?.isIntersecting);
        if (!visible) {
          scene.pause();
          return;
        }
        scene.resume();
        arrows?.sync();
      },
      { root: stack, threshold: 0.45 },
    );
    observer.observe(visibilityRoot);

    root.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  } catch (error) {
    console.debug('Place scene failed to start', error);
    loadError.value = true;
  }
});

onBeforeUnmount(() => {
  observer?.disconnect();
  arrows?.dispose();
  arrows = null;
  sceneRef?.dispose();
  sceneRef = null;
  rootRef.value?.removeEventListener('pointerdown', onPointerDown);
  rootRef.value?.removeEventListener('contextmenu', onContextMenu);
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
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
      Drag handles to edit · empty ground to orbit · Shift / right-drag to pan
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
    font: 0.85rem/1.3 system-ui, sans-serif;

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
    animation: place-spin 0.8s linear infinite;

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
    font: 0.62rem/1.3 var(--font-poppins, system-ui, sans-serif);
    letter-spacing: 0.02em;
    pointer-events: none;
    white-space: nowrap;
  }
}

@keyframes place-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

<style lang="scss">
// CSS2D labels live under .space-builder-labels (appended to label-host).
.sb-scene-anno {
  pointer-events: none;
  translate: 0 -0.35rem;
  filter: drop-shadow(0 1px 0 rgba(0, 0, 0, 0.55));
}

.sb-scene-anno__text {
  display: inline-block;
  padding: 0 0 0.12rem;
  border-bottom: 0.09rem solid #f4f0ea;
  color: #f4f0ea;
  font-family: sans-serif;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  white-space: nowrap;
  line-height: 1.15;
}

.space-builder-tag {
  padding: 0 0.45rem;
  border-radius: 10px;
  border: 2px solid rgba(162, 206, 59, 0.85);
  background: rgba(25, 41, 21, 0.85);
  color: #fff;
  font-family: 'Open Sans', var(--font-poppins, system-ui, sans-serif);
  font-size: 0.85rem;
  font-weight: 800;
  white-space: nowrap;
  pointer-events: none;
}
</style>
