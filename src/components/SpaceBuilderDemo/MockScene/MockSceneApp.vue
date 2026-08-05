<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue';

import {
  autoplayPausedToast,
  autoplayStartedToast,
  type AutoPlayController,
  type DemoCursorStep,
  type DemoToastPayload,
} from './AutoPlayController';
import { LAYOUT_ICONS } from './layoutIcons';
import {
  RAIL_ARRANGE_TOOLS,
  RAIL_EDIT_TOOLS,
  RAIL_EXTRA_TOOLS,
  RAIL_TOOLS,
  type RailTool,
} from './railTools';
import {
  DEFAULT_LAYOUT_OPTIONS,
  LAYOUT_LABELS,
  LAYOUT_STYLES,
  isAisleEnabled,
  uiFieldsForStyle,
  type LayoutStyle,
  type UiFieldId,
} from './scene/layoutEngine';
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

type CatalogItem = {
  id: string;
  name: string;
  thumb: string;
  /** Real demo object — drag / Build / dblclick work. */
  real?: boolean;
};

const CATALOG_ITEMS: CatalogItem[] = [
  {
    id: 'chair',
    name: 'Chair',
    thumb: '/demos/space-builder/chair-thumb.webp',
    real: true,
  },
  {
    id: 'armchair',
    name: 'Armchair',
    thumb: '/demos/space-builder/catalog/armchair.svg',
  },
  {
    id: 'barstool',
    name: 'Bar Stool',
    thumb: '/demos/space-builder/catalog/barstool.svg',
  },
  {
    id: 'lounge',
    name: 'Lounge',
    thumb: '/demos/space-builder/catalog/lounge.svg',
  },
  {
    id: 'table-round',
    name: 'Round Table',
    thumb: '/demos/space-builder/catalog/table-round.svg',
  },
  {
    id: 'table-cocktail',
    name: 'Cocktail Table',
    thumb: '/demos/space-builder/catalog/table-cocktail.svg',
  },
  {
    id: 'plant',
    name: 'Planter',
    thumb: '/demos/space-builder/catalog/plant.svg',
  },
  {
    id: 'umbrella',
    name: 'Umbrella',
    thumb: '/demos/space-builder/catalog/umbrella.svg',
  },
];

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
const catalogSearch = ref('');

const catalogItemsVisible = computed(() => {
  const q = catalogSearch.value.trim().toLowerCase();
  if (!q) return CATALOG_ITEMS;
  return CATALOG_ITEMS.filter((item) => item.name.toLowerCase().includes(q));
});

const selectedCatalogItem = computed(() => (
  CATALOG_ITEMS.find((item) => item.id === selectedCatalogId.value) ?? null
));

const canBuildSelected = computed(() => Boolean(selectedCatalogItem.value?.real));

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
let observer: IntersectionObserver | null = null;

const seatsInvalid = computed(() => {
  const snap = snapshot.value;
  if (!snap?.area) return false;
  return snap.options.seats > 0 && snap.options.seats > snap.maxSeats;
});

const layoutStyle = computed(() => snapshot.value?.options.style ?? 'grid');
const activeFields = computed(() => uiFieldsForStyle(layoutStyle.value));
const aisleEnabled = computed(() => {
  if (!activeFields.value.has('aisle')) return false;
  const opts = snapshot.value?.options ?? DEFAULT_LAYOUT_OPTIONS;
  return isAisleEnabled(layoutStyle.value, opts);
});

function fieldActive(id: UiFieldId) {
  return activeFields.value.has(id);
}

function formatDistance(meters: number) {
  if (meters >= 1) {
    const rounded = Math.round(meters * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded}m`;
  }
  return `${Math.round(meters * 100)}cm`;
}

function formatAngle(radians: number) {
  return `${Math.round((radians * 180) / Math.PI)}°`;
}
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
  if (event.button !== 0) return;

  const target = event.target as HTMLElement | null;
  // UI chrome handles its own clicks — don't steal them for orbit/draw.
  if (target?.closest('.rail, .sidebar, .flash, .toasts, button, input, label, details')) return;

  const scene = sceneRef.value;
  if (!scene) return;

  if (phase.value === 'placing') {
    scene.setGhostAt(event.clientX, event.clientY);
    return;
  }

  // Handles always win; empty space orbits — even while Build / Add is active.
  const handle = scene.pickHandle(event.clientX, event.clientY);
  if (handle) {
    scene.beginHandleDrag(handle, event.clientX, event.clientY);
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

  if (scene.isDraggingHandle()) {
    scene.updateHandleDrag(event.clientX, event.clientY);
    return;
  }
  if (phase.value === 'build' && scene.isDrawing()) {
    scene.updateAreaDraw(event.clientX, event.clientY);
    return;
  }
  if (phase.value === 'placing' && event.buttons > 0) {
    scene.setGhostAt(event.clientX, event.clientY);
    return;
  }
  if (event.buttons > 0 && scene.isOrbiting()) {
    scene.orbit(event.clientX, event.clientY);
  }
}

function onPointerUp(event: PointerEvent) {
  const scene = sceneRef.value;
  if (scene?.isDraggingHandle()) {
    scene.endHandleDrag();
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
  scene?.endOrbit();
}

function openAdd() {
  if (panel.value !== 'closed') {
    closePanel();
    return;
  }
  panel.value = 'catalog';
  phase.value = 'idle';
  selectedCatalogId.value = 'chair';
  catalogSearch.value = '';
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
  panel.value = 'catalog';
}

function confirmCatalogItem(item: CatalogItem) {
  selectCatalogItem(item);
  if (!item.real) {
    pushToast({ action: 'Placeholder · use Chair for the demo' });
    return;
  }
  // Match Space Builder: double-click advances past the catalog (Build path).
  startBuild();
}

function startBuild() {
  if (!canBuildSelected.value) {
    selectedCatalogId.value = 'chair';
  }
  phase.value = 'build';
  panel.value = 'options';
  sceneRef.value?.setFlash('Select an area where to place the objects');
}

function setStyle(style: LayoutStyle) {
  sceneRef.value?.setStyle(style);
}

function onSeatsInput(event: Event) {
  const value = Number((event.target as HTMLInputElement).value);
  sceneRef.value?.setOptions({ seats: Number.isFinite(value) ? value : 0 });
}

function onBlockWidth(event: Event) {
  const raw = (event.target as HTMLInputElement).value;
  const value = raw === '' ? 0 : Number(raw);
  sceneRef.value?.setOptions({ blocks: { width: Number.isFinite(value) ? value : 0 } });
}

function onBlockHeight(event: Event) {
  const raw = (event.target as HTMLInputElement).value;
  const value = raw === '' ? 0 : Number(raw);
  sceneRef.value?.setOptions({ blocks: { height: Number.isFinite(value) ? value : 0 } });
}

function onDistanceX(event: Event) {
  const value = Number((event.target as HTMLInputElement).value);
  sceneRef.value?.setOptions({ distanceX: value });
}

function onDistanceZ(event: Event) {
  const value = Number((event.target as HTMLInputElement).value);
  sceneRef.value?.setOptions({ distanceZ: value });
}

function onAisle(event: Event) {
  const value = Number((event.target as HTMLInputElement).value);
  sceneRef.value?.setOptions({ aisle: value });
}

function onOffset(event: Event) {
  const value = Number((event.target as HTMLInputElement).value);
  sceneRef.value?.setOptions({ offset: value });
}

function onAngle(event: Event) {
  const value = Number((event.target as HTMLInputElement).value);
  sceneRef.value?.setOptions({ angle: value });
}

function onInnerDiameter(event: Event) {
  const value = Number((event.target as HTMLInputElement).value);
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
  sceneRef.value?.placeGhostAsSingle();
  phase.value = 'idle';
  panel.value = 'closed';
  pushToast({ action: 'Object placed' });
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

  try {
    // Keep Three.js out of the Vue island chunk — load it only when mounting.
    // Yield between parse and WebGL setup so the long task doesn't block input.
    const [{ SpaceBuilderScene }, { AutoPlayController }] = await Promise.all([
      import('./scene/SpaceBuilderScene'),
      import('./AutoPlayController'),
    ]);

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });

    const scene = new SpaceBuilderScene({
      canvas,
      labelHost,
      onSnapshot: (next) => {
        snapshot.value = next;
      },
    });
    // Stay paused until the carousel page is in view — avoids WebGL work during boot.
    scene.pause();
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

    // Pause when this carousel page leaves the stack (same pattern as Marker Editor).
    const visibilityRoot =
      root.closest<HTMLElement>('article.technical-drawing-stack > section')
      ?? root.closest<HTMLElement>('.mock-scene-demo')
      ?? root;
    const stack = visibilityRoot.closest('article.technical-drawing-stack');
    observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        const visible = Boolean(entry?.isIntersecting);
        const wasVisible = inView.value;
        inView.value = visible;

        if (!visible) {
          controller.pause();
          scene.pause();
          cursorPhase.value = 'gone';
          return;
        }

        if (reducedMotion.value) {
          scene.pause();
          return;
        }

        scene.resume();
        if (visible && !wasVisible && !userControl.value) {
          startAutoplay(controller);
        } else if (visible && !userControl.value && chairsReady.value) {
          controller.resume();
        }
      },
      { root: stack, threshold: 0.55 },
    );
    observer.observe(visibilityRoot);

    // Marker Editor pattern: any trusted pointer over the page takes over.
    window.addEventListener('pointermove', onTrustedPointer, { passive: true });
    window.addEventListener('pointerdown', onTrustedPointer, { passive: true });
    root.addEventListener('pointermove', onPointerMove);
    root.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerup', onPointerUp);
  } catch (error) {
    console.debug('Space Builder demo failed to start', error);
    loadError.value = true;
  }
});

onBeforeUnmount(() => {
  observer?.disconnect();
  controllerRef.value?.destroy();
  sceneRef.value?.dispose();
  if (resumeTimer) clearTimeout(resumeTimer);
  if (handoffTimer) clearTimeout(handoffTimer);
  if (clickTimer) clearTimeout(clickTimer);
  window.removeEventListener('pointermove', onTrustedPointer);
  window.removeEventListener('pointerdown', onTrustedPointer);
  rootRef.value?.removeEventListener('pointermove', onPointerMove);
  rootRef.value?.removeEventListener('pointerdown', onPointerDown);
  rootRef.value?.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('pointerup', onPointerUp);
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
          <label class="catalog-search">
            <span class="visually-hidden">Search by name</span>
            <input
              v-model="catalogSearch"
              type="search"
              placeholder="Search by name"
              autocomplete="off"
              @keydown.stop
            >
          </label>

          <p v-if="catalogItemsVisible.length === 0" class="catalog-empty">
            Search does not match any object.
          </p>

          <div v-else class="catalog-grid">
            <button
              v-for="item in catalogItemsVisible"
              :key="item.id"
              type="button"
              class="option-item"
              :class="{
                active: selectedCatalogId === item.id,
                placeholder: !item.real,
              }"
              :data-demo-target="item.real ? 'catalog:chair' : `catalog:${item.id}`"
              :draggable="Boolean(item.real)"
              :title="item.real ? `${item.name} · double-click to Build` : `${item.name} (placeholder)`"
              @click="selectCatalogItem(item)"
              @dblclick="confirmCatalogItem(item)"
              @dragstart="onCatalogDragStart($event, item)"
              @dragend="onCatalogDragEnd"
            >
              <div class="object-icons">
                <img :src="item.thumb" alt="" width="120" height="90" />
              </div>
              <span class="item-label">
                <span class="object-name">{{ item.name }}</span>
              </span>
            </button>
          </div>
        </template>

        <template v-else>
          <details class="options-section" open>
            <summary>
              Seats
              <svg viewBox="0 0 24 16" width="18" height="12" aria-hidden="true">
                <rect x="2" y="6" width="8" height="3" rx="0.5" fill="currentColor" />
                <rect x="3" y="2" width="6" height="5" rx="0.8" fill="currentColor" />
                <rect x="14" y="6" width="8" height="3" rx="0.5" fill="currentColor" />
                <rect x="15" y="2" width="6" height="5" rx="0.8" fill="currentColor" />
              </svg>
            </summary>
            <label class="field" :class="{ invalid: seatsInvalid }">
              <span>Seat Count</span>
              <input
                data-demo-target="param:seats"
                type="number"
                min="0"
                :value="snapshot?.options.seats || ''"
                placeholder="Enter a value or leave empty to fill the selected area"
                :disabled="!fieldActive('seats')"
                @change="onSeatsInput"
              >
              <span v-if="seatsInvalid" class="invalid-feedback">
                Too many seats for this area (max {{ snapshot?.maxSeats ?? 0 }})
              </span>
            </label>
            <label
              class="field"
              :title="fieldActive('blocks') ? undefined : 'Not used by this layout'"
            >
              <span>Blocks of</span>
              <div class="blocks-of" data-demo-target="param:blocks">
                <input
                  type="number"
                  min="0"
                  placeholder="Chairs"
                  :value="snapshot?.options.blocks.width || ''"
                  :disabled="!fieldActive('blocks')"
                  @change="onBlockWidth"
                >
                <span class="times" aria-hidden="true">×</span>
                <input
                  type="number"
                  min="0"
                  placeholder="Rows"
                  :value="snapshot?.options.blocks.height || ''"
                  :disabled="!fieldActive('blocks')"
                  @change="onBlockHeight"
                >
              </div>
            </label>
          </details>

          <details class="options-section" open>
            <summary>
              Spacing
              <svg viewBox="0 0 24 16" width="18" height="12" aria-hidden="true">
                <path
                  d="M3 8h6M15 8h6M11 4v8"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                />
              </svg>
            </summary>
            <label
              class="field range-field"
              :title="fieldActive('distanceX') ? undefined : 'Not used by this layout'"
            >
              <span class="range-label">
                <span class="range-name">
                  Side to Side
                  <svg class="range-glyph" viewBox="0 0 48 20" aria-hidden="true">
                    <rect x="2" y="8" width="10" height="8" rx="1" fill="currentColor" />
                    <rect x="36" y="8" width="10" height="8" rx="1" fill="currentColor" />
                    <path d="M14 12h20M16 9l-3 3 3 3M32 9l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.6" />
                  </svg>
                </span>
                <span class="range-value">{{ formatDistance(snapshot?.options.distanceX ?? 0.2) }}</span>
              </span>
              <input
                data-demo-target="param:spacing-x"
                type="range"
                min="0"
                max="1.2"
                step="0.05"
                :value="snapshot?.options.distanceX ?? 0.2"
                :disabled="!fieldActive('distanceX')"
                @input="onDistanceX"
              >
            </label>
            <label
              class="field range-field"
              :title="fieldActive('distanceZ') ? undefined : 'Not used by this layout'"
            >
              <span class="range-label">
                <span class="range-name">
                  Front to Back
                  <svg class="range-glyph" viewBox="0 0 24 28" aria-hidden="true">
                    <rect x="7" y="2" width="10" height="8" rx="1" fill="currentColor" />
                    <rect x="7" y="18" width="10" height="8" rx="1" fill="currentColor" />
                    <path d="M12 11v6M9 13l3-3 3 3M9 15l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.6" />
                  </svg>
                </span>
                <span class="range-value">{{ formatDistance(snapshot?.options.distanceZ ?? 0.35) }}</span>
              </span>
              <input
                data-demo-target="param:spacing-z"
                type="range"
                min="0"
                max="1.2"
                step="0.05"
                :value="snapshot?.options.distanceZ ?? 0.35"
                :disabled="!fieldActive('distanceZ')"
                @input="onDistanceZ"
              >
            </label>
            <label
              class="field range-field"
              :title="aisleEnabled
                ? undefined
                : (fieldActive('aisle')
                  ? 'Set Blocks of to enable aisle spacing'
                  : 'Not used by this layout')"
            >
              <span class="range-label">
                <span class="range-name">
                  Aisle Spacing
                  <svg class="range-glyph" viewBox="0 0 48 20" aria-hidden="true">
                    <rect x="2" y="6" width="8" height="7" rx="1" fill="currentColor" />
                    <rect x="11" y="6" width="8" height="7" rx="1" fill="currentColor" />
                    <rect x="29" y="6" width="8" height="7" rx="1" fill="currentColor" />
                    <rect x="38" y="6" width="8" height="7" rx="1" fill="currentColor" />
                    <path d="M20 10h8M22 7l-3 3 3 3M26 7l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.5" />
                  </svg>
                </span>
                <span class="range-value">{{ formatDistance(snapshot?.options.aisle ?? 0.8) }}</span>
              </span>
              <input
                data-demo-target="param:aisle"
                type="range"
                min="0"
                max="2"
                step="0.05"
                :value="snapshot?.options.aisle ?? 0.8"
                :disabled="!aisleEnabled"
                @input="onAisle"
              >
            </label>
            <label
              class="field range-field"
              :title="fieldActive('offset') ? undefined : 'Not used by this layout'"
            >
              <span class="range-label">
                <span>Offset</span>
                <span class="range-value">{{ formatDistance(snapshot?.options.offset ?? 0.3) }}</span>
              </span>
              <input
                data-demo-target="param:offset"
                type="range"
                min="-0.8"
                max="0.8"
                step="0.05"
                :value="snapshot?.options.offset ?? 0.3"
                :disabled="!fieldActive('offset')"
                @input="onOffset"
              >
            </label>
            <label
              class="field range-field"
              :title="fieldActive('angle') ? undefined : 'Not used by this layout'"
            >
              <span class="range-label">
                <span>Angle</span>
                <span class="range-value">{{ formatAngle(snapshot?.options.angle ?? Math.PI / 8) }}</span>
              </span>
              <input
                data-demo-target="param:angle"
                type="range"
                min="0"
                :max="Math.PI / 4"
                step="0.01"
                :value="snapshot?.options.angle ?? Math.PI / 8"
                :disabled="!fieldActive('angle')"
                @input="onAngle"
              >
            </label>
            <label
              class="field range-field"
              :title="fieldActive('innerDiameter') ? undefined : 'Not used by this layout'"
            >
              <span class="range-label">
                <span>Inner Circle</span>
                <span class="range-value">{{ formatDistance(snapshot?.options.innerDiameter ?? 0) }}</span>
              </span>
              <input
                data-demo-target="param:inner"
                type="range"
                min="0"
                max="4"
                step="0.1"
                :value="snapshot?.options.innerDiameter ?? 0"
                :disabled="!fieldActive('innerDiameter')"
                @input="onInnerDiameter"
              >
            </label>
          </details>

          <details class="options-section" open>
            <summary>
              Layout Styles
              <svg viewBox="0 0 24 16" width="18" height="12" aria-hidden="true">
                <rect x="2" y="2" width="4" height="4" fill="currentColor" />
                <rect x="10" y="2" width="4" height="4" fill="currentColor" />
                <rect x="18" y="2" width="4" height="4" fill="currentColor" />
                <rect x="2" y="10" width="4" height="4" fill="currentColor" />
                <rect x="18" y="10" width="4" height="4" fill="currentColor" />
              </svg>
            </summary>
            <div class="layouts" role="group" aria-label="Layout styles">
              <button
                v-for="style in LAYOUT_STYLES"
                :key="style"
                type="button"
                class="layout-item"
                :data-demo-target="`layout:${style}`"
                :class="{ active: layoutStyle === style }"
                @click="setStyle(style)"
              >
                <span class="item-label">{{ LAYOUT_LABELS[style] }}</span>
                <div class="layout-style-icons" aria-hidden="true">
                  <img
                    :src="LAYOUT_ICONS[style]"
                    alt=""
                    width="56"
                    height="56"
                  >
                </div>
              </button>
            </div>
          </details>
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
$nav-second-bg: #151515;
$visrez-brand: #89ab24;
$navy: #1ab394;
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
  grid-template-columns: var(--sb-rail) minmax(0, 1fr) auto;
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
    position: relative;
    z-index: 4;
    grid-column: 1;
    grid-row: 1;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    width: var(--sb-rail);
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    scrollbar-width: none;
    background: $nav-main-bg;
    box-shadow: 2px 0 10px rgba(0, 0, 0, 0.35);

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
      box-shadow: 0 0 0 2px $visrez-brand;
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
    grid-column: 2;
    grid-row: 1;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: $scene-bg;
  }

  .scene-canvas {
    display: block;
    width: 100%;
    height: 100%;
    // Ensure the drawing buffer isn't left at the HTML default 300×150.
    max-width: none;
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
    grid-column: 3;
    grid-row: 1;
    width: min(17.5rem, 46vw);
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

  .catalog-search {
    display: block;
    margin-bottom: 0.75rem;

    input {
      box-sizing: border-box;
      width: 100%;
      padding: 0.4rem 0.55rem;
      border: 1px solid #495057;
      border-radius: 0.25rem;
      background: #212529;
      color: #f3f3f4;
      font: inherit;
      font-size: 0.8rem;

      &::placeholder {
        color: #adb5bd;
      }

      &:focus {
        outline: 0;
        border-color: $navy;
        box-shadow: 0 0 0 0.15rem rgba(26, 179, 148, 0.35);
      }
    }
  }

  .catalog-empty {
    margin: 1rem 0 0;
    font-size: 0.85rem;
    color: #adb5bd;
  }

  .catalog-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
    align-content: start;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .option-item {
    display: flex;
    flex-direction: column;
    width: 100%;
    padding: 0;
    border: 1px solid #495057;
    border-radius: 0.25rem;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: grab;
    overflow: hidden;
    user-select: none;

    &.placeholder {
      cursor: pointer;

      .object-icons {
        // Same tile chrome as real items — just mute the silhouette.
        filter: grayscale(1);

        img {
          opacity: 0.45;
        }
      }

      .item-label {
        color: #868e96;
        font-weight: 600;
      }

      &.active .item-label {
        color: rgba(255, 255, 255, 0.85);
      }
    }

    &:hover:not(.active) {
      border-color: #adb5bd;
    }

    &.active {
      box-shadow: 0 0 0 0.2rem rgba(26, 179, 148, 0.35);

      .item-label {
        background: $navy;
        color: #fff;
      }
    }

    &.is-demo-target {
      box-shadow: 0 0 0 0.2rem rgba(137, 171, 36, 0.65);
    }

    .object-icons {
      position: relative;
      display: flex;
      flex: 1 1 auto;
      min-height: 5rem;
      background: linear-gradient(59deg, #dee2e6 0%, #adb5bd 100%);

      img {
        display: block;
        width: 100%;
        height: auto;
        object-fit: contain;
        padding: 0.5rem;
      }
    }

    .item-label {
      display: block;
      margin: 0;
      padding: 0.35rem 0.4rem;
      background: #212529;
      text-align: center;
      font-size: 0.72rem;
      font-weight: 700;

      .object-name {
        display: block;
        overflow: hidden;
        max-height: 1.15em;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }
  }

  .options-section {
    margin-bottom: 0.85rem;

    summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.25rem 0.1rem 0.45rem;
      margin-bottom: 0.55rem;
      border-bottom: 1px solid $light-grey;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      list-style: none;
      color: #e9ecef;

      &::-webkit-details-marker {
        display: none;
      }

      svg {
        opacity: 0.85;
      }
    }
  }

  .field {
    display: grid;
    gap: 0.3rem;
    margin-bottom: 0.75rem;
    font-size: 0.72rem;
    color: #ced4da;

    input[type='number'],
    input[type='range'] {
      width: 100%;
    }

    input[type='number'] {
      padding: 0.4rem 0.5rem;
      border: 1px solid $light-grey;
      border-radius: 0.25rem;
      background: $nav-second-bg;
      color: #f3f3f4;
      font: inherit;
    }

    input[type='range'] {
      accent-color: $visrez-brand;
    }

    &.invalid {
      input[type='number'] {
        border-color: #dc3545;
      }
    }

    &:has(:disabled) {
      opacity: 0.45;

      .range-name,
      .range-value,
      .range-glyph,
      span {
        color: #868e96;
      }

      input[type='number']:disabled {
        border-color: #495057;
        color: #868e96;
        background: #2a2e33;
      }

      input[type='range']:disabled {
        accent-color: #6c757d;
      }
    }
  }

  .range-field {
    .range-label {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 0.5rem;
    }

    .range-name {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.35rem 0.55rem;
      font-weight: 600;
      color: #e9ecef;
    }

    .range-glyph {
      height: 1.1rem;
      width: auto;
      color: #ced4da;
    }

    .range-value {
      color: #adb5bd;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      padding: 0.15rem 0.35rem;
      border: 1px solid $light-grey;
      border-radius: 0.2rem;
      background: $nav-second-bg;
      font-size: 0.68rem;
    }
  }

  .blocks-of {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 0.35rem;
    align-items: center;

    .times {
      color: #adb5bd;
      font-weight: 700;
    }
  }

  .invalid-feedback {
    background: #dc3545;
    color: #fff;
    padding: 0.4rem 0.5rem;
    border-radius: 0.5rem;
    font-size: 0.68rem;
    font-weight: 600;
  }

  .layouts {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }

  .layout-item {
    display: flex;
    flex-direction: column;
    padding: 0;
    border: 1px solid #495057;
    border-radius: 0.25rem;
    background: transparent;
    color: #adb5bd;
    cursor: pointer;
    overflow: hidden;

    .item-label {
      display: block;
      margin: 0;
      padding: 0.3rem 0.25rem;
      background: #212529;
      text-align: center;
      font-size: 0.72rem;
      font-weight: 700;
      color: #f3f3f4;
    }

    .layout-style-icons {
      display: grid;
      place-items: center;
      padding: 0.55rem 0.35rem 0.7rem;
      background: linear-gradient(59deg, #dee2e6 0%, #adb5bd 100%);
      color: #151515;

      img {
        display: block;
        width: 3.5rem;
        height: 3.5rem;
        object-fit: contain;
      }
    }

    &.active {
      border-color: $visrez-brand;
      box-shadow: none;

      .item-label {
        background: $visrez-brand;
        color: #fff;
      }
    }

    &.is-demo-target {
      box-shadow: 0 0 0 0.15rem rgba(137, 171, 36, 0.85);
    }
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
