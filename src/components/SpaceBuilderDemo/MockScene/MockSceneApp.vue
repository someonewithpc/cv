<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue';

import { watchDrawingNote } from '@/client/drawingNote';
import { watchPageActive } from '@/client/frontPage';

import {
  AutoPlayController,
  autoplayPausedToast,
  autoplayStartedToast,
  type DemoCursorStep,
  type DemoToastPayload,
} from './AutoPlayController';
import CatalogPanel from './CatalogPanel.vue';
import { CATALOG_ITEMS, type CatalogItem } from './catalogItems';
import OptionsPanel from './OptionsPanel.vue';
import {
  RAIL_ARRANGE_TOOLS,
  RAIL_EDIT_TOOLS,
  RAIL_EXTRA_TOOLS,
  RAIL_TOOLS,
  type RailTool,
} from './railTools';
import { DEFAULT_LAYOUT_OPTIONS, type LayoutStyle } from './scene/layoutEngine';
import {
  claimSpaceBuilderGpu,
  prepareSpaceBuilderGpu,
  registerSpaceBuilderGpu,
  releaseSpaceBuilderGpu,
} from './scene/spaceBuilderGpu';
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
import type {
  SceneSnapshot,
  SpaceBuilderScene,
} from './scene/SpaceBuilderScene';

const RESUME_DELAY_MS = 2000;
const CURSOR_FADE_MS = 320;
const CURSOR_CLICK_MS = 180;
const TOAST_VISIBLE_MS = 1800;
const TOAST_EXIT_MS = 320;

type CursorPhase = 'demo' | 'fading' | 'gone';
type Panel = 'closed' | 'catalog' | 'options';
type Phase = 'idle' | 'build' | 'placing';

type DemoToast = DemoToastPayload & { id: number; leaving: boolean };

const railGroups: RailTool[][] = [
  RAIL_TOOLS,
  RAIL_EDIT_TOOLS,
  RAIL_ARRANGE_TOOLS,
  RAIL_EXTRA_TOOLS,
];

function toolIconStyle(tool: RailTool) {
  const url = `url(${tool.icon})`;
  return {
    maskImage: url,
    WebkitMaskImage: url,
  };
}

const rootRef = ref<HTMLElement | null>(null);

const sceneRef = shallowRef<SpaceBuilderScene | null>(null);
const controllerRef = shallowRef<AutoPlayController | null>(null);

const ready = ref(false);
const chairsReady = ref(false);
const selectedCatalogId = ref('chair');
// Bump to remount CatalogPanel (clears its internal search box) when Add reopens.
const catalogPanelKey = ref(0);

const selectedCatalogItem = computed(() => (
  CATALOG_ITEMS.find((item) => item.id === selectedCatalogId.value) ?? null
));

const canBuildSelected = computed(() => Boolean(selectedCatalogItem.value?.layoutable));

const loadError = ref(false);
const inView = ref(false);
const userControl = ref(false);
const reducedMotion = ref(false);

const panel = ref<Panel>('closed');
const phase = ref<Phase>('idle');
const snapshot = ref<SceneSnapshot | null>(null);

const cursorPhase = ref<CursorPhase>('gone');
const cursorPos = reactive({ x: 0, y: 0 });
const cursorClicking = ref(false);
const cursorDragging = ref(false);

const toasts = ref<DemoToast[]>([]);
let toastId = 0;

let resumeTimer: ReturnType<typeof setTimeout> | null = null;
let handoffTimer: ReturnType<typeof setTimeout> | null = null;
let clickTimer: ReturnType<typeof setTimeout> | null = null;
let stopPageWatch: (() => void) | null = null;
let stopNoteWatch: (() => void) | null = null;
let canvasRef: HTMLCanvasElement | null = null;
const activePointers = new Map<number, ScreenPoint>();
let pinch: PinchState | null = null;

const seatsInvalid = computed(() => {
  const snap = snapshot.value;
  if (!snap?.area) return false;
  return snap.options.seats > 0 && snap.options.seats > snap.maxSeats;
});

function pushToast(payload: DemoToastPayload) {
  const id = ++toastId;
  toasts.value = [...toasts.value.filter((t) => !t.leaving), { ...payload, id, leaving: false }];
  setTimeout(() => {
    toasts.value = toasts.value.map((t) => (t.id === id ? { ...t, leaving: true } : t));
    setTimeout(() => {
      toasts.value = toasts.value.filter((t) => t.id !== id);
    }, TOAST_EXIT_MS);
  }, TOAST_VISIBLE_MS);
}

/** Map viewport client coords into the demo root so the cursor scrolls with the page. */
function toRootPoint(clientX: number, clientY: number) {
  const root = rootRef.value;
  if (!root) return { x: clientX, y: clientY };
  const rect = root.getBoundingClientRect();
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };
}

function applyCursor(step: DemoCursorStep) {
  cursorDragging.value = Boolean(step.dragging);

  const scope = rootRef.value ?? document;
  scope.querySelectorAll('.is-demo-target').forEach((el) => el.classList.remove('is-demo-target'));

  if (step.client) {
    const point = toRootPoint(step.client.x, step.client.y);
    cursorPos.x = point.x;
    cursorPos.y = point.y;
  } else if (step.target) {
    const el = scope.querySelector(`[data-demo-target="${CSS.escape(step.target)}"]`);
    if (el instanceof HTMLElement) {
      const rect = el.getBoundingClientRect();
      const point = toRootPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      cursorPos.x = point.x;
      cursorPos.y = point.y;
    }
  }

  if (step.target) {
    scope.querySelector(`[data-demo-target="${CSS.escape(step.target)}"]`)
      ?.classList.add('is-demo-target');
  }

  if (cursorPhase.value === 'gone') cursorPhase.value = 'demo';

  if (step.click) {
    cursorClicking.value = true;
    if (clickTimer) clearTimeout(clickTimer);
    clickTimer = setTimeout(() => {
      cursorClicking.value = false;
    }, CURSOR_CLICK_MS);
  }
}

function yieldToUser() {
  // Match Marker Editor: any trusted activity pauses autoplay and resets the idle timer.
  if (resumeTimer) clearTimeout(resumeTimer);

  if (cursorPhase.value === 'demo') {
    if (handoffTimer) clearTimeout(handoffTimer);
    userControl.value = true;
    controllerRef.value?.pause();
    cursorPhase.value = 'fading';
    pushToast(autoplayPausedToast());
    handoffTimer = setTimeout(() => {
      cursorPhase.value = 'gone';
      handoffTimer = null;
    }, CURSOR_FADE_MS);
  } else if (!userControl.value) {
    userControl.value = true;
    controllerRef.value?.pause();
    cursorPhase.value = 'gone';
    pushToast(autoplayPausedToast());
  }

  resumeTimer = setTimeout(() => {
    resumeTimer = null;
    if (!inView.value || reducedMotion.value) return;
    userControl.value = false;
    cursorPhase.value = 'demo';
    controllerRef.value?.resume();
    pushToast(autoplayStartedToast());
  }, RESUME_DELAY_MS);
}

function onTrustedPointer(event: PointerEvent) {
  if (!event.isTrusted) return;
  if (!inView.value) return;

  // Only hand off when the pointer is over this demo (or its teleported cursor is not the issue).
  // Marker Editor listens globally while in-view; we scope to the frame so the rest of the CV
  // page can be used without constantly pausing a below-the-fold autoplay.
  const host = rootRef.value?.closest('.mock-scene-demo') ?? rootRef.value;
  if (!host) return;
  const target = event.target;
  const overHost = target instanceof Node && host.contains(target);
  if (!overHost) {
    const rect = host.getBoundingClientRect();
    const inside =
      event.clientX >= rect.left
      && event.clientX <= rect.right
      && event.clientY >= rect.top
      && event.clientY <= rect.bottom;
    if (!inside) {
      // Still refresh the idle timer while the user is in control and may have left briefly.
      if (userControl.value && resumeTimer) {
        clearTimeout(resumeTimer);
        resumeTimer = setTimeout(() => {
          resumeTimer = null;
          if (!inView.value || reducedMotion.value) return;
          userControl.value = false;
          cursorPhase.value = 'demo';
          controllerRef.value?.resume();
          pushToast(autoplayStartedToast());
        }, RESUME_DELAY_MS);
      }
      return;
    }
  }

  yieldToUser();
}

function onPointerDown(event: PointerEvent) {
  if (!event.isTrusted) return;
  if (!userControl.value) yieldToUser();

  const target = event.target as HTMLElement | null;
  // UI chrome handles its own clicks — don't steal them for orbit/draw.
  if (target?.closest('.rail, .sidebar, .flash, .toasts, button, input, label, details')) return;

  const scene = sceneRef.value;
  if (!scene) return;

  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  trySetPointerCapture(event.currentTarget, event.pointerId);

  if (activePointers.size >= 2) {
    const [a, b] = activePointers.values();
    if (a && b) pinch = beginPinch(scene, a, b);
    return;
  }

  // Shift/Ctrl+LMB or RMB pans the orbit target (same in every 3D SB view).
  if (event.button === 2 || (event.button === 0 && (event.shiftKey || event.ctrlKey || event.metaKey))) {
    scene.beginPan(event.clientX, event.clientY);
    return;
  }
  if (event.button !== 0) return;

  if (phase.value === 'placing') {
    scene.setGhostAt(event.clientX, event.clientY);
    return;
  }

  // Handles always win; empty space orbits — even while Build / Add is active.
  const handle = scene.pickHandle(event.clientX, event.clientY, {
    screenSlop: handleScreenSlop(event),
  });
  if (handle) {
    scene.beginHandleDrag(handle, event.clientX, event.clientY);
    if (canvasRef) canvasRef.style.cursor = 'grabbing';
    return;
  }

  // First Build placement: drag out a new area on empty ground.
  if (phase.value === 'build' && !scene.hasArea()) {
    scene.beginAreaDraw(event.clientX, event.clientY);
    return;
  }

  scene.beginOrbit(event.clientX, event.clientY);
}

function onPointerMove(event: PointerEvent) {
  if (!userControl.value) return;
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

  if (scene.isDraggingHandle()) {
    scene.updateHandleDrag(event.clientX, event.clientY, { snap: event.altKey });
    return;
  }
  if (phase.value === 'build' && scene.isDrawing()) {
    scene.updateAreaDraw(event.clientX, event.clientY);
    return;
  }
  if (phase.value === 'placing' && (event.buttons > 0 || activePointers.has(event.pointerId))) {
    scene.setGhostAt(event.clientX, event.clientY);
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
  const scene = sceneRef.value;
  activePointers.delete(event.pointerId);

  if (pinch) {
    if (activePointers.size < 2) {
      pinch = null;
      scene?.endPan();
      scene?.endOrbit();
    }
    return;
  }

  if (scene?.isDraggingHandle()) {
    scene.endHandleDrag();
    if (canvasRef) updateHandleHoverCursor(scene, canvasRef, event.clientX, event.clientY, 'grab');
    return;
  }
  if (phase.value === 'build' && scene?.isDrawing()) {
    scene.endAreaDraw();
    return;
  }
  if (phase.value === 'placing' && event.isTrusted && event.button === 0) {
    scene?.placeGhostAsSingle();
    phase.value = 'idle';
    panel.value = 'closed';
    pushToast({ action: 'Object placed' });
    return;
  }
  scene?.endPan();
  scene?.endOrbit();
}

function onWheel(event: WheelEvent) {
  if (!event.isTrusted) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest('.rail, .sidebar, .flash, .toasts, button, input, label, details')) return;
  const scene = sceneRef.value;
  if (!scene) return;
  if (!userControl.value) yieldToUser();
  applyWheelZoom(scene, event);
}

function onContextMenu(event: Event) {
  event.preventDefault();
}

function openAdd() {
  if (panel.value !== 'closed') {
    closePanel();
    return;
  }
  panel.value = 'catalog';
  phase.value = 'idle';
  selectedCatalogId.value = 'chair';
  sceneRef.value?.activateCatalogItem('chair');
  catalogPanelKey.value += 1;
}

function closePanel() {
  panel.value = 'closed';
  phase.value = 'idle';
  sceneRef.value?.setFlash(null);
}

function goBack() {
  if (panel.value === 'options') {
    panel.value = 'catalog';
    phase.value = 'idle';
    sceneRef.value?.setFlash(null);
    return;
  }
  closePanel();
}

function selectCatalogItem(item: CatalogItem) {
  selectedCatalogId.value = item.id;
  sceneRef.value?.activateCatalogItem(item.id, item.modelUrl);
  panel.value = 'catalog';
}

function confirmCatalogItem(item: CatalogItem) {
  selectCatalogItem(item);
  if (!item.real) {
    pushToast({ action: 'Placeholder · use Chair for the demo' });
    return;
  }
  if (!item.layoutable) {
    pushToast({ action: 'Drag onto the floor to place' });
    return;
  }
  // Match Space Builder: double-click advances past the catalog (Build path).
  startBuild();
}

function startBuild() {
  if (!canBuildSelected.value) {
    selectedCatalogId.value = 'chair';
    sceneRef.value?.activateCatalogItem('chair');
  }
  phase.value = 'build';
  panel.value = 'options';
  sceneRef.value?.setFlash('Select an area where to place the objects');
}

function setStyle(style: LayoutStyle) {
  sceneRef.value?.setStyle(style);
}

function onSeatsInput(value: number) {
  sceneRef.value?.setOptions({ seats: value });
}

function onBlockWidth(value: number) {
  sceneRef.value?.setOptions({ blocks: { width: value } });
}

function onBlockHeight(value: number) {
  sceneRef.value?.setOptions({ blocks: { height: value } });
}

function onDistanceX(value: number) {
  sceneRef.value?.setOptions({ distanceX: value });
}

function onDistanceZ(value: number) {
  sceneRef.value?.setOptions({ distanceZ: value });
}

function onAisle(value: number) {
  sceneRef.value?.setOptions({ aisle: value });
}

function onOffset(value: number) {
  sceneRef.value?.setOptions({ offset: value });
}

function onAngle(value: number) {
  sceneRef.value?.setOptions({ angle: value });
}

function onInnerDiameter(value: number) {
  sceneRef.value?.setOptions({ innerDiameter: value });
}

function clearArea() {
  sceneRef.value?.clearArea();
}

function resetOptions() {
  sceneRef.value?.setOptions({
    ...DEFAULT_LAYOUT_OPTIONS,
    blocks: { ...DEFAULT_LAYOUT_OPTIONS.blocks },
  });
}

function saveArrangement() {
  const snap = snapshot.value;
  if (!snap?.valid) return;
  pushToast({ action: 'Arrangement saved' });
  panel.value = 'closed';
  phase.value = 'idle';
}

function onCatalogDragStart(event: DragEvent, item: CatalogItem) {
  if (!item.real) {
    event.preventDefault();
    return;
  }
  if (!userControl.value) yieldToUser();
  selectedCatalogId.value = item.id;
  sceneRef.value?.activateCatalogItem(item.id, item.modelUrl);
  phase.value = 'placing';
  panel.value = 'catalog';
  sceneRef.value?.setGhostVisible(true);
  event.dataTransfer?.setData('text/plain', item.id);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
}

function onCatalogDragEnd() {
  if (phase.value === 'placing') {
    sceneRef.value?.setGhostVisible(false);
    phase.value = 'idle';
  }
}

function onViewportDragOver(event: DragEvent) {
  if (phase.value !== 'placing' && !event.dataTransfer?.types.includes('text/plain')) return;
  event.preventDefault();
  if (!userControl.value) yieldToUser();
  phase.value = 'placing';
  sceneRef.value?.setGhostAt(event.clientX, event.clientY);
}

function onViewportDrop(event: DragEvent) {
  event.preventDefault();
  if (!userControl.value) yieldToUser();
  sceneRef.value?.setGhostAt(event.clientX, event.clientY);
  const placed = sceneRef.value?.placeGhostAsSingle() ?? false;
  phase.value = 'idle';
  // A drop that beat the model's own download placed nothing — leave the catalog open
  // so the next drag lands, rather than claiming an object that isn't there.
  if (placed) panel.value = 'closed';
  pushToast({ action: placed ? 'Object placed' : 'Still loading · drag again' });
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key === 'a' || event.key === 'A') {
    event.preventDefault();
    if (!userControl.value) yieldToUser();
    openAdd();
  } else if (event.key === 'Escape') {
    if (panel.value !== 'closed') goBack();
  }
}

function startAutoplay(controller: AutoPlayController) {
  if (reducedMotion.value || userControl.value || !chairsReady.value) return;
  if (cursorPhase.value === 'demo') {
    controller.resume();
    return;
  }
  controller.start();
  cursorPhase.value = 'demo';
  pushToast(autoplayStartedToast());
}

function restartDemo() {
  if (!chairsReady.value) return;
  if (resumeTimer) { clearTimeout(resumeTimer); resumeTimer = null; }
  if (handoffTimer) { clearTimeout(handoffTimer); handoffTimer = null; }
  userControl.value = false;
  cursorPhase.value = 'demo';
  sceneRef.value?.reset();
  panel.value = 'closed';
  phase.value = 'idle';
  controllerRef.value?.start();
}

onMounted(async () => {
  reducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const root = rootRef.value;
  const canvas = root?.querySelector<HTMLCanvasElement>('[data-scene-canvas]');
  const labelHost = root?.querySelector<HTMLElement>('[data-label-host]');
  if (!root || !canvas || !labelHost) {
    console.debug('Space Builder demo mount missing DOM nodes', { root, canvas, labelHost });
    loadError.value = true;
    return;
  }
  canvasRef = canvas;

  try {
    // Keep Three.js out of the Vue island chunk — load it only when mounting.
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
    });
    // Stay paused until the carousel page is in view — avoids WebGL work during boot.
    scene.pause();
    registerSpaceBuilderGpu(scene);
    sceneRef.value = scene;

    if (reducedMotion.value) scene.pause();

    // Show the 3D shell immediately; chair GLB + meshopt finish in the background.
    ready.value = true;
    // Layout may settle after Vue paints the rail/grid — force a resize next frames.
    requestAnimationFrame(() => {
      scene.forceResize();
      requestAnimationFrame(() => scene.forceResize());
    });

    const controller = new AutoPlayController(
      scene,
      applyCursor,
      pushToast,
      (patch) => {
        if (patch.panel) panel.value = patch.panel;
        if (patch.phase) phase.value = patch.phase;
      },
    );
    controllerRef.value = controller;

    void scene.loadChair()
      .then(() => {
        chairsReady.value = true;
        if (inView.value && !reducedMotion.value && !userControl.value) {
          startAutoplay(controller);
        }
      })
      .catch((error) => {
        console.debug('Space Builder demo chair failed to load', error);
      });

    // Pause when this carousel page stops being the front one (same pattern as Marker Editor).
    const visibilityRoot =
      root.closest<HTMLElement>('article.technical-drawing-stack > * > section')
      ?? root.closest<HTMLElement>('.mock-scene-demo')
      ?? root;
    stopPageWatch = watchPageActive(visibilityRoot, (active) => {
      const wasActive = inView.value;
      inView.value = active;

      if (!active) {
        controller.pause();
        releaseSpaceBuilderGpu(scene);
        cursorPhase.value = 'gone';
        return;
      }

      if (reducedMotion.value) {
        scene.pause();
        return;
      }

      claimSpaceBuilderGpu(scene);
      if (!wasActive && !userControl.value) {
        startAutoplay(controller);
      } else if (!userControl.value && chairsReady.value) {
        controller.resume();
      }
    });

    // Hold the demo still while the note dialog covers this page.
    stopNoteWatch = watchDrawingNote(visibilityRoot, (open) => {
      if (open) {
        controller.pause();
        scene.pause();
      } else {
        scene.resume();
        if (inView.value && !userControl.value) controller.resume();
      }
    });

    // Marker Editor pattern: any trusted pointer over the page takes over.
    window.addEventListener('pointermove', onTrustedPointer, { passive: true });
    window.addEventListener('pointerdown', onTrustedPointer, { passive: true });
    root.addEventListener('pointermove', onPointerMove);
    root.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('wheel', onWheel, { passive: false });
    root.addEventListener('contextmenu', onContextMenu);
    root.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  } catch (error) {
    console.debug('Space Builder demo failed to start', error);
    loadError.value = true;
  }
});

onBeforeUnmount(() => {
  stopPageWatch?.();
  stopPageWatch = null;
  stopNoteWatch?.();
  stopNoteWatch = null;
  controllerRef.value?.destroy();
  if (sceneRef.value) releaseSpaceBuilderGpu(sceneRef.value);
  sceneRef.value?.dispose();
  canvasRef = null;
  if (resumeTimer) clearTimeout(resumeTimer);
  if (handoffTimer) clearTimeout(handoffTimer);
  if (clickTimer) clearTimeout(clickTimer);
  window.removeEventListener('pointermove', onTrustedPointer);
  window.removeEventListener('pointerdown', onTrustedPointer);
  rootRef.value?.removeEventListener('pointermove', onPointerMove);
  rootRef.value?.removeEventListener('pointerdown', onPointerDown);
  rootRef.value?.removeEventListener('wheel', onWheel);
  rootRef.value?.removeEventListener('contextmenu', onContextMenu);
  rootRef.value?.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('pointercancel', onPointerUp);
});
</script>

<template>
  <div
    ref="rootRef"
    class="space-builder-app"
    tabindex="0"
    role="application"
    aria-label="Space Builder Add tool demo"
    :data-ready="ready ? 'true' : 'false'"
    :data-user-control="userControl ? 'true' : 'false'"
    :data-panel="panel"
    @focus="yieldToUser"
  >
    <aside class="rail" aria-label="Tools">
      <div class="rail-logo" aria-hidden="true" title="Visrez">
        <img
          class="rail-logo-img"
          src="/demos/space-builder/builder-logo.png"
          alt=""
          width="40"
          height="40"
        >
      </div>

      <template v-for="(group, groupIndex) in railGroups" :key="groupIndex">
        <span v-if="groupIndex > 0" class="rail-sep" aria-hidden="true" />
        <template v-for="tool in group" :key="tool.id">
          <button
            v-if="tool.active"
            type="button"
            class="tool"
            :data-demo-target="tool.demoTarget"
            :class="{ active: panel !== 'closed' }"
            :title="tool.title"
            aria-label="Add object"
            aria-keyshortcuts="A"
            @click="openAdd"
          >
            <span
              class="tool-icon"
              :style="toolIconStyle(tool)"
              aria-hidden="true"
            />
          </button>
          <button
            v-else
            type="button"
            class="tool muted"
            tabindex="-1"
            disabled
            :title="tool.title"
          >
            <span
              class="tool-icon"
              :style="toolIconStyle(tool)"
              aria-hidden="true"
            />
          </button>
        </template>
      </template>
    </aside>

    <div
      class="viewport"
      @dragover="onViewportDragOver"
      @drop="onViewportDrop"
    >
      <canvas data-scene-canvas class="scene-canvas" aria-label="Space Builder demo scene" />
      <div data-label-host class="label-host" />

      <div v-if="!ready || loadError" class="boot-cover" :class="{ error: loadError }" :role="loadError ? 'status' : undefined">
        <span v-if="!loadError" class="spinner" aria-hidden="true" />
        <span>{{ loadError ? '3D scene unavailable — see the blueprint pages for the Add tool flow.' : 'Loading scene…' }}</span>
      </div>

      <div v-if="snapshot?.flash" class="flash" role="status">
        <p class="flash-message">{{ snapshot.flash }}</p>
      </div>

      <button
        v-if="ready && !loadError"
        type="button"
        class="restart-btn"
        :disabled="!chairsReady"
        title="Restart the demo"
        @click="restartDemo"
      >
        <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
          <path
            d="M15.5 5.5A6.5 6.5 0 1 0 16.9 11M15.5 5.5V2M15.5 5.5H12"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        Restart
      </button>

      <div class="toasts" aria-live="polite">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="toast"
          :class="{ leaving: toast.leaving }"
        >
          {{ toast.action }}
        </div>
      </div>
    </div>

    <aside
      v-if="panel !== 'closed'"
      class="sidebar"
      aria-label="Add tool"
    >
      <header class="sidebar-header">
        <button
          type="button"
          class="sidebar-close"
          :title="panel === 'options' ? 'Go back' : 'Cancel'"
          @click="goBack"
        >
          <svg v-if="panel === 'options'" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              d="M15 5l-7 7 7 7"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <svg v-else viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6L6 18"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
            />
          </svg>
        </button>
        <h3 class="sidebar-title">
          {{ panel === 'catalog' ? 'Select an Object' : 'Options' }}
        </h3>
      </header>

      <div class="sidebar-body">
        <template v-if="panel === 'catalog'">
          <CatalogPanel
            :key="catalogPanelKey"
            :items="CATALOG_ITEMS"
            :selected-id="selectedCatalogId"
            @select="selectCatalogItem"
            @confirm="confirmCatalogItem"
            @dragstart="onCatalogDragStart"
            @dragend="onCatalogDragEnd"
          />
        </template>

        <template v-else>
          <OptionsPanel
            :snapshot="snapshot"
            :seats-invalid="seatsInvalid"
            @seats="onSeatsInput"
            @block-width="onBlockWidth"
            @block-height="onBlockHeight"
            @distance-x="onDistanceX"
            @distance-z="onDistanceZ"
            @aisle="onAisle"
            @offset="onOffset"
            @angle="onAngle"
            @inner-diameter="onInnerDiameter"
            @style="setStyle"
          />
        </template>
      </div>

      <footer class="sidebar-footer">
        <template v-if="panel === 'catalog'">
          <span class="dnd-hint">
            <strong>Drag &amp; Drop</strong>
            <em> -or- </em>
          </span>
          <button
            type="button"
            class="action action--primary"
            data-demo-target="action:build"
            :disabled="!canBuildSelected"
            @click="startBuild"
          >            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
              <rect x="2" y="2" width="16" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="3 2" />
              <path d="M6 10h8M10 6v8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
            Build
          </button>
        </template>
        <template v-else>
          <button type="button" class="action action--muted" data-demo-target="action:clear" @click="clearArea">
            Clear
          </button>
          <button type="button" class="action action--muted" @click="resetOptions">
            Reset
          </button>
          <button
            type="button"
            class="action action--primary action--save"
            data-demo-target="action:save"
            :disabled="!snapshot?.valid"
            @click="saveArrangement"
          >
            Save
          </button>
        </template>
      </footer>
    </aside>

    <div
      v-if="cursorPhase !== 'gone'"
      class="space-builder-demo-cursor"
      :class="[
        `space-builder-demo-cursor--${cursorPhase}`,
        { 'space-builder-demo-cursor--clicking': cursorClicking },
        { 'space-builder-demo-cursor--dragging': cursorDragging },
      ]"
      :style="{ left: `${cursorPos.x}px`, top: `${cursorPos.y}px` }"
      aria-hidden="true"
    >
      <svg viewBox="0 0 32 32" width="56" height="56">
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
$nav-main-bg: #323232;
$nav-main-active-bg: #293846;
$nav-sidebar-bg: #323232;
$visrez-brand: #89ab24;
$buttons-ui: #6c757d;
$light-grey: #565656;
$scene-bg: #212121;

.space-builder-app {
  --sb-rail: 70px;

  position: relative;
  width: 100%;
  height: 100%;
  min-height: 100%;
  min-width: 0;
  display: grid;
  // The rail is an overlay (see .rail below), not a track — the viewport
  // spans full width and renders underneath it, so toggling the rail on a
  // narrow frame never resizes the WebGL canvas (a mid-transition resize
  // every frame is what made the slide look janky).
  grid-template-columns: minmax(0, 1fr) auto;
  // Bound the row so the Options sidebar scrolls instead of growing the app
  // (parent mock frame clips with overflow:hidden).
  grid-template-rows: minmax(0, 1fr);
  font-family: 'Open Sans', var(--font-poppins, system-ui, sans-serif);
  color: #f3f3f4;
  background: $scene-bg;
  outline: none;
  color-scheme: only dark;
  forced-color-adjust: none;

  &:focus-visible {
    box-shadow: inset 0 0 0 2px $visrez-brand;
  }

  .rail {
    position: absolute;
    inset: 0 auto 0 0;
    z-index: 4;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    width: 70px;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    scrollbar-width: none;
    background: $nav-main-bg;
    // On a narrow sheet the drawing folds its note out of the bottom-left corner
    // and the tab lands on this column. The panel can wear it; a tool button
    // cannot. A border in the panel's own colour ends the scrollport above the
    // tab while the column still runs to the sheet's corner — padding would not,
    // since it only moves the last button once the rail is scrolled to its end.
    // Page.astro sets --note-fold-reach, and it is 0 wherever there is no tab.
    border-block-end: var(--note-fold-reach, 0px) solid $nav-main-bg;
    box-shadow: 2px 0 10px rgba(0, 0, 0, 0.35);
    transform: translateX(calc(var(--sb-rail) - 70px));
    transition: transform 0.25s ease;

    @media (prefers-reduced-motion: reduce) {
      transition: none;
    }

    &::-webkit-scrollbar {
      display: none;
    }
  }

  .rail-logo {
    display: grid;
    place-items: center;
    padding: 0.55rem 0.35rem 0.4rem;
  }

  .rail-logo-img {
    display: block;
    width: 2.35rem;
    height: 2.35rem;
    object-fit: contain;
  }

  .tool {
    display: grid;
    place-items: center;
    width: 100%;
    padding: 9px 0;
    border: 0;
    border-right: 4px solid $nav-main-bg;
    background: $nav-main-bg;
    color: #a7b1c2;
    cursor: pointer;
    line-height: 1;

    &:hover:not(:disabled) {
      background: $nav-main-active-bg;
      border-right-color: $nav-main-active-bg;
      box-shadow: 0 0 0.5rem rgba(0, 0, 0, 0.5);
      color: #fff;
    }

    &:focus-visible {
      outline: 2px solid $visrez-brand;
      outline-offset: -2px;
    }

    &.active {
      background: $nav-main-active-bg;
      border-right-color: $visrez-brand;
      box-shadow: 0 0 0.5rem rgba(0, 0, 0, 0.5);
      color: #fff;

      &:hover:not(:disabled) {
        border-right-color: $visrez-brand;
      }
    }

    &.muted,
    &:disabled {
      color: rgba(255, 255, 255, 0.25);
      opacity: 1;
      cursor: default;
      box-shadow: none;

      &:hover {
        background: $nav-main-bg;
        border-right-color: $nav-main-bg;
        color: rgba(255, 255, 255, 0.25);
        box-shadow: none;
      }
    }

    &.is-demo-target {
      // Match `.active` — right rail accent only (a full ring looked like a stray
      // horizontal green line across the top of the tool).
      background: $nav-main-active-bg;
      border-right-color: $visrez-brand;
      color: #fff;
    }
  }

  .rail-sep {
    display: block;
    height: 5px;
    margin: 0.75em 0;
    background-image: url('/demos/space-builder/separator.svg');
    background-position: center;
    background-repeat: repeat-x;
  }

  .tool-icon {
    display: block;
    width: 1.35rem;
    height: 1.35rem;
    background-color: currentColor;
    mask-size: contain;
    mask-repeat: no-repeat;
    mask-position: center;
    -webkit-mask-size: contain;
    -webkit-mask-repeat: no-repeat;
    -webkit-mask-position: center;
  }

  .viewport {
    position: relative;
    grid-column: 1;
    grid-row: 1;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: $scene-bg;
    touch-action: none;
  }

  .scene-canvas {
    display: block;
    width: 100%;
    height: 100%;
    // Ensure the drawing buffer isn't left at the HTML default 300×150.
    max-width: none;
    touch-action: none;
  }

  .label-host {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .fallback,
  .boot-cover {
    position: absolute;
    inset: 0;
    z-index: 6;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 0.75rem;
    padding: 1rem;
    text-align: center;
    background: #212121;
    color: #ced4da;
    font-size: 0.85rem;

    &.error {
      background: #292929;
    }
  }

  .spinner {
    width: 2rem;
    height: 2rem;
    border: 4px solid $visrez-brand;
    border-top-color: transparent;
    border-radius: 50%;
    animation: sb-spin 0.8s linear infinite;

    @media (prefers-reduced-motion: reduce) {
      animation: none;
      border-color: $visrez-brand;
    }
  }

  .flash {
    position: absolute;
    top: 0.45rem;
    left: 0;
    right: 0;
    display: flex;
    justify-content: center;
    pointer-events: none;
    z-index: 5;

    .flash-message {
      margin: 0;
      width: min(80%, 28rem);
      padding: 0.55rem 0.9rem;
      border-radius: 0.25rem;
      background: #d9edf7;
      border: 1px solid #bce8f1;
      color: #31708f;
      font-size: 0.85rem;
      text-align: center;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
    }
  }

  .restart-btn {
    position: absolute;
    top: 0.55rem;
    right: 0.55rem;
    z-index: 5;
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.28rem 0.6rem 0.28rem 0.5rem;
    border: 1px solid $visrez-brand;
    border-radius: 0.25rem;
    background: color-mix(in oklab, $visrez-brand 25%, #171717);
    color: #f4ffe8;
    font: 700 0.68rem/1.3 var(--font-poppins, system-ui, sans-serif);
    cursor: pointer;
    white-space: nowrap;

    &:hover:not(:disabled) {
      background: color-mix(in oklab, $visrez-brand 40%, #171717);
    }

    &:disabled {
      opacity: 0.5;
      cursor: default;
    }
  }

  .toasts {
    position: absolute;
    bottom: 0.75rem;
    left: 50%;
    translate: -50% 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    pointer-events: none;
    z-index: 5;
  }

  .toast {
    padding: 0.45rem 0.85rem;
    border-radius: 0.25rem;
    background: rgba(26, 179, 148, 0.92);
    color: #fff;
    font-size: 0.78rem;
    font-weight: 600;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    transition: opacity 0.3s ease, translate 0.3s ease;

    &.leaving {
      opacity: 0;
      translate: 0 0.35rem;
    }
  }

  .sidebar {
    position: relative;
    z-index: 4;
    grid-column: 2;
    grid-row: 1;
    // Space Builder gives the Add sidebar 780px of a 1440px window, three catalog cards
    // across at 178px each. This frame is about half as wide, so take a comparable share
    // and keep the cards near the product's size instead of shrinking them to fit.
    width: min(22rem, 52vw);
    min-height: 0;
    max-height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: $nav-sidebar-bg;
    color: #f3f3f4;
    box-shadow: -4px 0 16px rgba(0, 0, 0, 0.4);
  }

  .sidebar-header {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.45rem 0.65rem;
    border-bottom: 1px solid $light-grey;
  }

  .sidebar-close {
    display: grid;
    place-items: center;
    padding: 0.2rem;
    border: 0;
    background: transparent;
    color: #dfe4ea;
    cursor: pointer;

    &:hover {
      color: $visrez-brand;
    }
  }

  .sidebar-title {
    margin: 0;
    flex: 1;
    font-size: 0.95rem;
    font-weight: 600;
    text-align: right;
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
    min-height: 0;
    background: $nav-sidebar-bg;
    border-top: 1px solid $light-grey;
  }

  .dnd-hint {
    margin-right: auto;
    font-size: 0.78rem;
    color: #ced4da;
    white-space: nowrap;

    strong {
      font-weight: 700;
      color: #fff;
    }

    em {
      margin: 0 0.35rem;
      font-style: italic;
      opacity: 0.85;
    }
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

    &.is-demo-target {
      box-shadow: 0 0 0 2px $visrez-brand;
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
    flex: 1.35;
  }

  .action--save {
    flex: 1.4;
    padding-block: 0.55rem;
    font-size: 0.9rem;
  }

  // Narrow frame (phone-portrait or a squeezed tablet window): the sidebar's
  // vw-based width no longer tracks the shrunk frame, so switch it to the
  // frame's own size and let it claim less of it. The rail stays visible
  // while idle (it's the only way to reach Add on a touch device) but tucks
  // away once the sidebar it opens needs the room back, then reappears when
  // the sidebar closes.
  @container (max-width: 34rem) {
    .sidebar {
      width: min(11rem, 68cqw);
    }

    &:not([data-panel="closed"]) {
      --sb-rail: 0px;
    }
  }
}

@keyframes sb-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

<style lang="scss">
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

.space-builder-demo-cursor {
  // Absolute inside `.space-builder-app` so page/carousel scroll keeps the tip
  // glued to targets (fixed + viewport client coords desync on scroll).
  position: absolute;
  z-index: 30;
  width: 56px;
  height: 56px;
  // Hotspot at the arrow tip (same idea as Marker Editor).
  translate: -12% -8%;
  // Scale the click pulse around the tip, not the box center — otherwise the
  // tip drifts off the aimed point and clicks look mis-aimed.
  transform-origin: 12% 8%;
  pointer-events: none;
  transition:
    left 0.55s cubic-bezier(0.22, 1, 0.36, 1),
    top 0.55s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.32s ease,
    scale 0.12s ease;

  &--fading {
    opacity: 0;
  }

  &--dragging {
    transition: none;
  }

  &--clicking {
    scale: 0.88;
  }

  svg {
    display: block;
    filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.25));
  }
}
</style>
