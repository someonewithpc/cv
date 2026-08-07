<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue';

import { autoplayStartedToast } from './AutoPlayController';
import CatalogPanel from './CatalogPanel.vue';
import { CATALOG_ITEMS, type CatalogItem } from './catalogItems';
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

type Phase = 'idle' | 'placing';

/** Fractions of the canvas rect — autoplay cycles the drop point between these. */
const DROP_POINTS: Array<[number, number]> = [
  [0.4, 0.42],
  [0.62, 0.58],
  [0.32, 0.66],
];

const RESUME_DELAY_MS = 2500;

const rootRef = ref<HTMLElement | null>(null);
const ready = ref(false);
const loadError = ref(false);
const phase = ref<Phase>('idle');
const selectedId = ref('chair');
const toast = ref<string | null>(null);
const demoPlaying = ref(false);
const cursorVisible = ref(false);
const cursorClicking = ref(false);
/** True while a tween is driving cursorPos every frame — the JS easing already
 * smooths motion, so the CSS position transition (meant for discrete jumps)
 * only adds trailing lag here, most visibly right at the drop, where it makes
 * the orbit look like it starts before the cursor visually finishes arriving. */
const cursorInstant = ref(false);
const cursorPos = reactive({ x: 0, y: 0 });
/** Catalog thumbnail shown while a drag is still over the sidebar — mirrors the browser's
 * own drag-image for native HTML5 drag, which this pointer-based drag doesn't get for free. */
const draggedThumb = ref<string | null>(null);

const sceneRef = shallowRef<SpaceBuilderScene | null>(null);
let observer: IntersectionObserver | null = null;
const activePointers = new Map<number, ScreenPoint>();
let pinch: PinchState | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
/** Catalog item mid-drag via pointer (not native HTML5 DnD — see onItemPointerdown). */
let draggingItem: CatalogItem | null = null;

let inView = false;
let userControl = false;
let chairsReady = false;
let reducedMotion = false;
let autoplayToken = 0;
let resumeTimer: ReturnType<typeof setTimeout> | null = null;

function showToast(message: string) {
  toast.value = message;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.value = null;
  }, 1800);
}

function isChrome(target: EventTarget | null) {
  return target instanceof Element && target.closest('.sidebar, button, input, label, details');
}

function canvasRect() {
  const canvas = rootRef.value?.querySelector('[data-scene-canvas]');
  return canvas?.getBoundingClientRect() ?? null;
}

function withinRect(clientX: number, clientY: number, rect: DOMRect) {
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

/**
 * Show the catalog thumbnail while the drag point is still over the sidebar — matching
 * native HTML5 drag, whose browser-drawn drag-image follows the cursor everywhere, including
 * over the source panel. Once the point crosses into the viewport, swap to the real 3D ghost,
 * same as `onViewportDragOver` does for the native-drag flow on the Main page.
 */
function updateDragVisual(item: CatalogItem, clientX: number, clientY: number) {
  const scene = sceneRef.value;
  moveCursorTo(clientX, clientY);
  const rect = canvasRect();
  if (rect && withinRect(clientX, clientY, rect)) {
    draggedThumb.value = null;
    scene?.setGhostAt(clientX, clientY);
  } else {
    draggedThumb.value = item.thumb;
    scene?.setGhostVisible(false);
  }
}

function selectItem(item: CatalogItem) {
  yieldToUser();
  selectedId.value = item.id;
  if (!item.real) {
    showToast('Placeholder — use Chair for the demo');
  }
}

/**
 * Pointer-driven drag instead of native HTML5 Drag and Drop — a long native
 * drag occasionally tripped Chrome's tab-tear-off / Snap Layouts gesture near
 * the top of the window. This is also the only way to support touch drag.
 */
function onItemPointerdown(event: PointerEvent, item: CatalogItem) {
  if (!item.real) return;
  yieldToUser();
  event.preventDefault();
  selectedId.value = item.id;
  draggingItem = item;
  phase.value = 'placing';
  trySetPointerCapture(event.currentTarget, event.pointerId);
  updateDragVisual(item, event.clientX, event.clientY);
}

function endItemDrag(clientX: number, clientY: number) {
  const scene = sceneRef.value;
  draggingItem = null;
  phase.value = 'idle';
  draggedThumb.value = null;
  if (!scene) return;

  const rect = canvasRect();
  const overViewport = rect && withinRect(clientX, clientY, rect);

  if (overViewport) {
    scene.setGhostAt(clientX, clientY);
    scene.placeGhostAsSingle();
    showToast('Chair placed');
  } else {
    scene.setGhostVisible(false);
  }
}

function onPointerDown(event: PointerEvent) {
  const scene = sceneRef.value;
  const root = rootRef.value;
  if (!scene || !root || isChrome(event.target)) return;
  yieldToUser();

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

  if (draggingItem) {
    updateDragVisual(draggingItem, event.clientX, event.clientY);
    return;
  }

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
  }
}

function onPointerUp(event: PointerEvent) {
  const scene = sceneRef.value;
  activePointers.delete(event.pointerId);

  if (draggingItem) {
    endItemDrag(event.clientX, event.clientY);
    return;
  }
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

// --- Autoplay: a demo cursor drives the same scene calls a real drag would. ---

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** Client coords → position relative to root, since the cursor element lives inside it. */
function toRootPoint(clientX: number, clientY: number) {
  const rect = rootRef.value?.getBoundingClientRect();
  if (!rect) return { x: clientX, y: clientY };
  return { x: clientX - rect.left, y: clientY - rect.top };
}

function moveCursorTo(clientX: number, clientY: number) {
  const p = toRootPoint(clientX, clientY);
  cursorPos.x = p.x;
  cursorPos.y = p.y;
}

/** Fraction of the canvas rect → client coords, so targets scale with viewport size. */
function canvasPoint(fx: number, fy: number) {
  const canvas = rootRef.value?.querySelector('[data-scene-canvas]');
  const rect = canvas?.getBoundingClientRect();
  if (!rect) return { x: 0, y: 0 };
  return { x: rect.left + rect.width * fx, y: rect.top + rect.height * fy };
}

function tweenPoint(
  token: number,
  from: { x: number; y: number },
  to: { x: number; y: number },
  ms: number,
  onFrame: (p: { x: number; y: number }) => void,
) {
  return new Promise<void>((resolve) => {
    const start = performance.now();
    const step = (now: number) => {
      if (token !== autoplayToken) {
        resolve();
        return;
      }
      const t = Math.min(1, (now - start) / ms);
      const eased = t * t * (3 - 2 * t);
      onFrame({ x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased });
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

function elementCenter(el: Element | null) {
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

async function pulseClick(token: number) {
  cursorClicking.value = true;
  await wait(160);
  if (token !== autoplayToken) return;
  cursorClicking.value = false;
}

/** Incremental orbit so the drop reads as a real 3D scene, not a flat image. */
function orbitTween(token: number, deltaTheta: number, ms: number) {
  return new Promise<void>((resolve) => {
    const start = performance.now();
    let applied = 0;
    const step = (now: number) => {
      const scene = sceneRef.value;
      if (token !== autoplayToken || !scene) {
        resolve();
        return;
      }
      const t = Math.min(1, (now - start) / ms);
      const eased = t * t * (3 - 2 * t);
      const target = deltaTheta * eased;
      scene.orbitBy(target - applied);
      applied = target;
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

/** Drag one chair from the catalog to (fx, fy) and orbit briefly. False once the token goes stale. */
async function placeAndOrbit(
  token: number,
  scene: SpaceBuilderScene,
  root: HTMLElement,
  fx: number,
  fy: number,
  orbitDir: 1 | -1,
): Promise<boolean> {
  const chairItem = CATALOG_ITEMS.find((item) => item.id === 'chair');
  const chairBtn = root.querySelector('[data-demo-target="catalog:chair"]');
  const chairPos = elementCenter(chairBtn);
  if (!chairItem || !chairPos) return false;

  moveCursorTo(chairPos.x, chairPos.y);
  await wait(500);
  if (token !== autoplayToken) return false;

  await pulseClick(token);
  if (token !== autoplayToken) return false;
  selectedId.value = 'chair';
  updateDragVisual(chairItem, chairPos.x, chairPos.y);

  const dropPoint = canvasPoint(fx, fy);
  cursorInstant.value = true;
  await tweenPoint(token, chairPos, dropPoint, 900, (p) => {
    updateDragVisual(chairItem, p.x, p.y);
  });
  cursorInstant.value = false;
  if (token !== autoplayToken) return false;
  draggedThumb.value = null;
  scene.setGhostAt(dropPoint.x, dropPoint.y);
  scene.placeGhostAsSingle();
  showToast('Chair placed');

  await orbitTween(token, orbitDir * 0.4, 700);
  if (token !== autoplayToken) return false;
  await wait(700);
  return true;
}

async function runAutoplay() {
  const token = autoplayToken;
  demoPlaying.value = true;
  cursorVisible.value = true;
  const scene = sceneRef.value;
  const root = rootRef.value;
  if (!scene || !root) {
    // Only this run's own failure to start — a superseding run (newer token)
    // already owns demoPlaying/cursorVisible and must not be clobbered here.
    if (token === autoplayToken) demoPlaying.value = false;
    return;
  }

  outer: while (token === autoplayToken) {
    for (let i = 0; i < DROP_POINTS.length; i += 1) {
      const [fx, fy] = DROP_POINTS[i];
      const ok = await placeAndOrbit(token, scene, root, fx, fy, i % 2 === 0 ? 1 : -1);
      if (!ok) break outer;
    }
    // Hold the fully-built scene a beat, then clear for the next lap.
    await wait(900);
    if (token !== autoplayToken) break;
    scene.clearArea();
    await wait(500);
  }
  // A stale run reaching here (superseded mid-flight) must leave the current
  // run's state alone — stopAutoplay() already did this run's own cleanup.
  if (token === autoplayToken) demoPlaying.value = false;
}

function startAutoplay() {
  if (reducedMotion || userControl || !chairsReady || !inView) return;
  autoplayToken += 1;
  void runAutoplay();
}

function stopAutoplay() {
  autoplayToken += 1;
  demoPlaying.value = false;
  cursorVisible.value = false;
  draggedThumb.value = null;
  if (draggingItem) {
    sceneRef.value?.setGhostVisible(false);
    draggingItem = null;
  }
}

function yieldToUser() {
  if (resumeTimer) clearTimeout(resumeTimer);
  if (demoPlaying.value) stopAutoplay();
  userControl = true;
  resumeTimer = setTimeout(() => {
    resumeTimer = null;
    userControl = false;
    startAutoplay();
  }, RESUME_DELAY_MS);
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

    ready.value = true;
    requestAnimationFrame(() => {
      scene.forceResize();
      requestAnimationFrame(() => scene.forceResize());
    });

    void scene.loadChair().then(() => {
      chairsReady = true;
      if (inView) startAutoplay();
    }).catch((error) => {
      console.debug('DnD scene chair failed to load', error);
    });

    const visibilityRoot =
      root.closest<HTMLElement>('article.technical-drawing-stack > section') ?? root;
    const stack = visibilityRoot.closest('article.technical-drawing-stack');
    observer = new IntersectionObserver(
      (entries) => {
        const visible = Boolean(entries[0]?.isIntersecting);
        inView = visible;
        if (!visible) {
          releaseSpaceBuilderGpu(scene);
          stopAutoplay();
          return;
        }
        claimSpaceBuilderGpu(scene);
        startAutoplay();
      },
      { root: stack, threshold: 0.45 },
    );
    observer.observe(visibilityRoot);

    root.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('wheel', onWheel, { passive: false });
    root.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  } catch (error) {
    console.debug('DnD scene failed to start', error);
    loadError.value = true;
  }
});

onBeforeUnmount(() => {
  observer?.disconnect();
  autoplayToken += 1;
  if (resumeTimer) clearTimeout(resumeTimer);
  if (toastTimer) clearTimeout(toastTimer);
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
    class="dnd-scene-app"
    tabindex="0"
    :data-ready="ready ? 'true' : 'false'"
    aria-label="Drag and Drop demo — autoplaying the Add tool; drag Chair onto the ground or take over"
  >
    <div class="viewport">
      <canvas data-scene-canvas class="scene-canvas" aria-label="Ground for placing or filling with chairs" />
      <div data-label-host class="label-host" />

      <div
        v-if="!ready || loadError"
        class="boot-cover"
        :class="{ error: loadError }"
        :role="loadError ? 'status' : undefined"
      >
        <span v-if="!loadError" class="spinner" aria-hidden="true" />
        <span>{{ loadError ? '3D scene unavailable' : 'Loading catalog…' }}</span>
      </div>

      <p v-if="demoPlaying" class="demo-flash" role="status">{{ autoplayStartedToast().action }}</p>

      <div v-if="toast" class="toast" aria-live="polite">{{ toast }}</div>

      <p v-if="ready && !loadError" class="hint">
        Drag Chair onto the ground · orbit to look around
      </p>
    </div>

    <aside class="sidebar" aria-label="Select an Object" @pointerdown="yieldToUser" @focusin="yieldToUser">
      <header class="sidebar-header">
        <h3 class="sidebar-title">Select an Object</h3>
      </header>
      <div class="sidebar-body">
        <CatalogPanel
          :items="CATALOG_ITEMS"
          :selected-id="selectedId"
          :native-drag="false"
          @select="selectItem"
          @item-pointerdown="onItemPointerdown"
        />
      </div>
    </aside>

    <div
      v-if="draggedThumb"
      class="demo-drag-thumb"
      :class="{ instant: cursorInstant }"
      :style="{ left: `${cursorPos.x}px`, top: `${cursorPos.y}px` }"
      aria-hidden="true"
    >
      <img :src="draggedThumb" alt="">
    </div>

    <div
      v-if="cursorVisible"
      class="demo-cursor"
      :class="{ clicking: cursorClicking, instant: cursorInstant }"
      :style="{ left: `${cursorPos.x}px`, top: `${cursorPos.y}px` }"
      aria-hidden="true"
    >
      <svg viewBox="0 0 32 32" width="40" height="40">
        <path
          d="M4 2.5v24.2l6.4-6.2 4.1 9.7 4.2-1.8-4.1-9.6H26z"
          fill="#fff"
          stroke="#222"
          stroke-width="1.6"
          stroke-linejoin="round"
        />
      </svg>
    </div>
  </div>
</template>

<style lang="scss" scoped>
$visrez-brand: #89ab24;
$light-grey: #565656;
$nav-sidebar-bg: #323232;
$scene-bg: #212121;

.dnd-scene-app {
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
  animation: dnd-spin 0.8s linear infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
    border-color: $visrez-brand;
  }
}

.demo-flash {
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

.toast {
  position: absolute;
  // Below the "Demo playing" pill so autoplay's own toasts don't collide with it.
  top: 2.3rem;
  left: 50%;
  translate: -50% 0;
  z-index: 2;
  padding: 0.35rem 0.75rem;
  border-radius: 0.25rem;
  background: rgba(26, 179, 148, 0.92);
  color: #fff;
  font-size: 0.72rem;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  pointer-events: none;
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

.demo-cursor {
  position: absolute;
  // Above the sidebar (which has no z-index of its own) so it stays visible while the
  // autoplaying drag passes over the catalog, instead of being painted underneath it.
  z-index: 6;
  width: 40px;
  height: 40px;
  translate: -12% -8%;
  transform-origin: 12% 8%;
  pointer-events: none;
  transition: left 0.12s linear, top 0.12s linear, scale 0.12s ease;

  // While a tween is driving cursorPos every frame, its own easing already
  // smooths the motion — this transition would only add trailing lag on top,
  // most visibly right at the drop point.
  &.instant {
    transition: scale 0.12s ease;
  }

  &.clicking {
    scale: 0.88;
  }

  svg {
    display: block;
    filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.35));
  }
}

/** Stand-in for the browser's own drag-image — shown only while the simulated drag point
 * is still over the sidebar, since the pointer-based drag (see onItemPointerdown) doesn't
 * get one for free the way native HTML5 drag does. */
.demo-drag-thumb {
  position: absolute;
  z-index: 5;
  width: 4.2rem;
  height: 3.1rem;
  padding: 0.3rem;
  border-radius: 0.3rem;
  background: linear-gradient(59deg, #dee2e6 0%, #adb5bd 100%);
  box-shadow: 0 0.25rem 0.6rem rgba(0, 0, 0, 0.45);
  translate: -50% -128%;
  pointer-events: none;
  transition: left 0.12s linear, top 0.12s linear;

  &.instant {
    transition: none;
  }

  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
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
    max-height: min(46cqh, 100%);
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

</style>
