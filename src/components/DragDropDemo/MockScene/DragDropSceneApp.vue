<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue';

import { watchDrawingNote } from '@/client/drawingNote';
import { onAutoplayCommand, reportAutoplayState } from '@/client/autoplayStatus';
import { watchPageActive } from '@/client/frontPage';

import { autoplayStartedToast } from '@/components/SpaceBuilderDemo/MockScene/AutoPlayController';
import CatalogPanel from '@/components/SpaceBuilderDemo/MockScene/CatalogPanel.vue';
import {
  CATALOG_ITEMS,
  variantsOf,
  type CatalogItem,
  type CatalogVariant,
} from '@/components/SpaceBuilderDemo/MockScene/catalogItems';
import {
  claimSpaceBuilderGpu,
  prepareSpaceBuilderGpu,
  registerSpaceBuilderGpu,
  releaseSpaceBuilderGpu,
} from '@/components/SpaceBuilderDemo/MockScene/scene/spaceBuilderGpu';
import {
  applyWheelZoom,
  beginPinch,
  trySetPointerCapture,
  updatePinch,
  type PinchState,
  type ScreenPoint,
} from '@/components/SpaceBuilderDemo/MockScene/scene/sceneViewportGestures';
import type { SpaceBuilderScene } from '@/components/SpaceBuilderDemo/MockScene/scene/SpaceBuilderScene';

/**
 * `armed` is Space Builder's `editor.action === 'create'`: the object rides the pointer and
 * the next click on the floor puts it down. `dragging` is the same ghost carried by a held
 * pointer. Both end in one object and a return to `idle` — neither stays armed afterwards.
 */
type Phase = 'idle' | 'armed' | 'dragging';

/** Fractions of the canvas rect — autoplay cycles the drop point between these. */
const DROP_POINTS: Array<[number, number]> = [
  [0.4, 0.42],
  [0.62, 0.58],
  [0.32, 0.66],
];

/** The non-layoutable real item autoplay arms by double-click; the Chair is Build's, not Single's. */
const CLICK_ROUTE_ID = 'table-round';

/**
 * One style per card. The finish carousel and the seat and size pickers are their own PR
 * (catalog-carousel); until that lands, each card places its default style.
 */
const DND_ITEMS: CatalogItem[] = CATALOG_ITEMS.map((item) => ({
  ...item,
  variants: item.variants?.slice(0, 1),
}));

const rootRef = ref<HTMLElement | null>(null);
const ready = ref(false);
const loadError = ref(false);
const phase = ref<Phase>('idle');
const selectedId = ref('chair');
const toast = ref<string | null>(null);
const demoPlaying = ref(false);
const cursorVisible = ref(false);
const cursorClicking = ref(false);
/** Waiting on the double-clicked object's GLB, with the page held the way the product holds it. */
const arming = ref(false);
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
let stopPageWatch: (() => void) | null = null;
let stopNoteWatch: (() => void) | null = null;
const activePointers = new Map<number, ScreenPoint>();
let pinch: PinchState | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
/** Catalog item mid-drag via pointer (not native HTML5 DnD — see onItemPointerdown). */
let draggingItem: CatalogItem | null = null;
let draggingVariant: CatalogVariant | null = null;
/** Item riding the pointer after a double-click, waiting for the floor click that puts it down. */
const armedItem = ref<CatalogItem | null>(null);
/** The last placed object carries the product's selection highlight until the next one starts. */
const selectedPlacement = ref(false);
/** Pressed card waiting to see whether the pointer moves far enough to be a drag. */
let pendingDrag: {
  item: CatalogItem;
  variant: CatalogVariant;
  pointerId: number;
  origin: ScreenPoint;
  target: EventTarget | null;
} | null = null;
const DRAG_THRESHOLD_PX = 5;

let inView = false;
let userControl = false;
let chairsReady = false;
let reducedMotion = false;
let autoplayToken = 0;

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
 * same as `onViewportDragOver` does for the Main page native-drag flow.
 */
function updateDragVisual(item: CatalogItem, clientX: number, clientY: number) {
  const scene = sceneRef.value;
  moveCursorTo(clientX, clientY);
  const rect = canvasRect();
  if (rect && withinRect(clientX, clientY, rect)) {
    draggedThumb.value = null;
    scene?.setGhostAt(clientX, clientY);
  } else {
    draggedThumb.value = draggingVariant?.thumb ?? item.thumb;
    scene?.setGhostVisible(false);
  }
}

/** A single click only highlights a card and swaps the live ghost, the way the product does. */
function selectItem(item: CatalogItem, variant: CatalogVariant = variantsOf(item)[0]) {
  yieldToUser();
  selectedId.value = item.id;
  sceneRef.value?.activateCatalogItem(item.id, variant);
  if (!item.real) showToast('Placeholder · use Chair, Side Chair or Banquet Table');
}

/**
 * Double-click is what arms Space Builder's Add tool. Objects the library files under a
 * seating category go to Build instead (draw an area, fill it), which is the Space Builder
 * stack's walkthrough, so the Chair only says where that lives.
 */
function confirmItem(item: CatalogItem, variant: CatalogVariant = variantsOf(item)[0]) {
  selectItem(item, variant);
  if (!item.real) return;
  if (item.layoutable) {
    showToast('Chair fills an area with Build · see the Space Builder stack');
    return;
  }
  void armItem(item, variant);
}

/**
 * Space Builder holds a full-page spinner over this route until the GLB is in, which is why
 * only a drag can lose the race on page three. Wait the same way before arming.
 */
async function armItem(item: CatalogItem, variant: CatalogVariant) {
  const scene = sceneRef.value;
  if (!scene) return;
  scene.clearSelection();
  selectedPlacement.value = false;
  scene.activateCatalogItem(item.id, variant);
  arming.value = true;
  await scene.whenCatalogItemReady(variant.id);
  arming.value = false;
  if (sceneRef.value !== scene || phase.value === 'dragging') return;
  armedItem.value = item;
  phase.value = 'armed';
  draggedThumb.value = null;
}

/** Esc, or a placement, puts the object down and returns the tool to view. */
function disarm() {
  if (phase.value !== 'armed') return;
  armedItem.value = null;
  phase.value = 'idle';
  sceneRef.value?.setGhostVisible(false);
}

/** The one call both routes end in: one object lands, or nothing did because the GLB is late. */
function dropOne(clientX: number, clientY: number) {
  const scene = sceneRef.value;
  if (!scene) return;
  scene.setGhostAt(clientX, clientY);
  // The product says nothing on success: the selected object on the floor is the signal.
  if (!scene.placeGhostAsSingle()) showToast('Still loading · pick it again');
  selectedPlacement.value = scene.hasSelection();
}

/**
 * Pointer-driven drag instead of native HTML5 Drag and Drop — a long native
 * drag occasionally tripped Chrome's tab-tear-off / Snap Layouts gesture near
 * the top of the window. This is also the only way to support touch drag.
 */
/**
 * The press only arms a pending drag: `preventDefault()` here would swallow the card's own
 * click and double-click, which are the other route in. The drag starts on the first move
 * past the threshold, the way a real drag does.
 */
function onItemPointerdown(event: PointerEvent, item: CatalogItem, variant: CatalogVariant) {
  if (!item.real || event.button !== 0) return;
  yieldToUser();
  pendingDrag = {
    item,
    variant,
    pointerId: event.pointerId,
    origin: { x: event.clientX, y: event.clientY },
    target: event.currentTarget,
  };
}

function startItemDrag(clientX: number, clientY: number) {
  if (!pendingDrag) return;
  const { item, variant, pointerId, target } = pendingDrag;
  pendingDrag = null;
  selectedId.value = item.id;
  armedItem.value = null;
  sceneRef.value?.clearSelection();
  selectedPlacement.value = false;
  sceneRef.value?.activateCatalogItem(item.id, variant);
  draggingItem = item;
  draggingVariant = variant;
  phase.value = 'dragging';
  trySetPointerCapture(target, pointerId);
  updateDragVisual(item, clientX, clientY);
}

/** The catalog thumbnail is a plain `<img>`, so a press on it still offers the browser's image drag. */
function onItemDragStart(event: DragEvent) {
  event.preventDefault();
}

function endItemDrag(clientX: number, clientY: number) {
  const scene = sceneRef.value;
  draggingItem = null;
  draggingVariant = null;
  phase.value = 'idle';
  draggedThumb.value = null;
  if (!scene) return;

  const rect = canvasRect();
  if (rect && withinRect(clientX, clientY, rect)) dropOne(clientX, clientY);
  else scene.setGhostVisible(false);
}

function onPointerDown(event: PointerEvent) {
  const scene = sceneRef.value;
  const root = rootRef.value;
  if (!scene || !root || isChrome(event.target)) return;
  yieldToUser();

  // An armed object goes down on the next plain left click, and the tool returns to view —
  // it does not stay armed for a second click.
  if (phase.value === 'armed' && event.button === 0 && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
    const item = armedItem.value;
    disarm();
    dropOne(event.clientX, event.clientY);
    return;
  }

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

  if (pendingDrag && event.pointerId === pendingDrag.pointerId) {
    const { origin } = pendingDrag;
    if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) >= DRAG_THRESHOLD_PX) {
      startItemDrag(event.clientX, event.clientY);
    }
    return;
  }

  if (draggingItem) {
    updateDragVisual(draggingItem, event.clientX, event.clientY);
    return;
  }

  if (phase.value === 'armed') {
    const rect = canvasRect();
    if (rect && withinRect(event.clientX, event.clientY, rect)) {
      scene.setGhostAt(event.clientX, event.clientY);
    } else {
      scene.setGhostVisible(false);
    }
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

  if (pendingDrag?.pointerId === event.pointerId) pendingDrag = null;

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

function onKeyDown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || phase.value !== 'armed') return;
  yieldToUser();
  disarm();
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

/** Incremental orbit so the drop reads as a real 3D scene, not a flat image — the demo
 * cursor drags horizontally in step with the rotation, as if it were the one causing it.
 * `startClient` is where the drag left off; the horizontal travel is the inverse of
 * `SpaceBuilderScene.orbit()`'s `theta -= dx * 0.005`, so the same eased curve that drives
 * the camera also drives the cursor. */
function orbitTween(token: number, deltaTheta: number, ms: number, startClient: { x: number; y: number }) {
  return new Promise<void>((resolve) => {
    const start = performance.now();
    const totalDx = -deltaTheta / 0.005;
    let applied = 0;
    cursorInstant.value = true;
    cursorClicking.value = true;
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
      moveCursorTo(startClient.x + totalDx * eased, startClient.y);
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

/**
 * Scroll the catalog until the card is in view before the demo cursor goes for it, so the
 * viewer sees where the object came from. Only the panel scrolls, never the page.
 */
async function revealCatalogCard(root: HTMLElement, id: string) {
  const card = root.querySelector<HTMLElement>(`[data-demo-target="catalog:${id}"]`);
  const body = root.querySelector<HTMLElement>('.sidebar-body');
  if (!card || !body) return;
  const cardRect = card.getBoundingClientRect();
  const bodyRect = body.getBoundingClientRect();
  if (cardRect.top >= bodyRect.top && cardRect.bottom <= bodyRect.bottom) return;
  const offset = cardRect.top - bodyRect.top - (bodyRect.height - cardRect.height) / 2;
  body.scrollBy({ top: offset, behavior: reducedMotion ? 'auto' : 'smooth' });
  await wait(reducedMotion ? 50 : 450);
}

function catalogButton(root: HTMLElement, id: string) {
  const item = CATALOG_ITEMS.find((entry) => entry.id === id);
  const pos = elementCenter(root.querySelector(`[data-demo-target="catalog:${id}"]`));
  return item && pos ? { item, pos } : null;
}

/** Drag one object from the catalog to (fx, fy) and orbit briefly. False once the token goes stale. */
async function dragAndOrbit(
  token: number,
  scene: SpaceBuilderScene,
  root: HTMLElement,
  id: string,
  fx: number,
  fy: number,
  orbitDir: 1 | -1,
): Promise<boolean> {
  await revealCatalogCard(root, id);
  if (token !== autoplayToken) return false;
  const target = catalogButton(root, id);
  if (!target) return false;
  const { item, pos } = target;
  const variant = variantsOf(item)[0];

  moveCursorTo(pos.x, pos.y);
  await wait(500);
  if (token !== autoplayToken) return false;

  await pulseClick(token);
  if (token !== autoplayToken) return false;
  selectedId.value = item.id;
  phase.value = 'dragging';
  scene.clearSelection();
  selectedPlacement.value = false;
  scene.activateCatalogItem(item.id, variant);
  updateDragVisual(item, pos.x, pos.y);

  const dropPoint = canvasPoint(fx, fy);
  cursorInstant.value = true;
  await tweenPoint(token, pos, dropPoint, 900, (p) => {
    updateDragVisual(item, p.x, p.y);
  });
  cursorInstant.value = false;
  if (token !== autoplayToken) return false;
  draggedThumb.value = null;
  // Letting go is the whole drag: one object lands and the tool is back to idle.
  phase.value = 'idle';
  dropOne(dropPoint.x, dropPoint.y);

  await orbitTween(token, orbitDir * 0.4, 700, dropPoint);
  cursorInstant.value = false;
  cursorClicking.value = false;
  if (token !== autoplayToken) return false;
  await wait(700);
  return true;
}

/** The other route: double-click a card, carry the object on the pointer, click the floor once. */
async function armAndClick(
  token: number,
  scene: SpaceBuilderScene,
  root: HTMLElement,
  id: string,
  fx: number,
  fy: number,
): Promise<boolean> {
  await revealCatalogCard(root, id);
  if (token !== autoplayToken) return false;
  const target = catalogButton(root, id);
  if (!target) return false;
  const { item, pos } = target;
  const variant = variantsOf(item)[0];

  moveCursorTo(pos.x, pos.y);
  await wait(450);
  if (token !== autoplayToken) return false;

  await pulseClick(token);
  await wait(120);
  await pulseClick(token);
  if (token !== autoplayToken) return false;

  selectedId.value = item.id;
  scene.clearSelection();
  selectedPlacement.value = false;
  scene.activateCatalogItem(item.id, variant);
  // The product blocks behind a spinner until the GLB is in, so its click route cannot
  // lose the race the drag route can (page three).
  await scene.whenCatalogItemReady(variant.id);
  if (token !== autoplayToken) return false;
  armedItem.value = item;
  phase.value = 'armed';

  const dropPoint = canvasPoint(fx, fy);
  cursorInstant.value = true;
  await tweenPoint(token, pos, dropPoint, 900, (p) => {
    moveCursorTo(p.x, p.y);
    const rect = canvasRect();
    if (rect && withinRect(p.x, p.y, rect)) scene.setGhostAt(p.x, p.y);
    else scene.setGhostVisible(false);
  });
  cursorInstant.value = false;
  if (token !== autoplayToken) return false;

  await pulseClick(token);
  if (token !== autoplayToken) return false;
  phase.value = 'idle';
  armedItem.value = null;
  dropOne(dropPoint.x, dropPoint.y);
  await wait(900);
  return token === autoplayToken;
}

/**
 * The product's Remove action, one object at a time: click it to select it, then delete
 * it. The floor empties the way a visitor would empty it, not by a scene reset.
 */
async function removePlaced(token: number, scene: SpaceBuilderScene) {
  while (scene.placedCount() > 0) {
    const centre = scene.selectPlaced(scene.placedCount() - 1);
    selectedPlacement.value = true;
    const at = centre ? scene.groundToClient(centre.x, centre.z) : null;
    if (at) {
      moveCursorTo(at.x, at.y);
      await wait(300);
      if (token !== autoplayToken) return false;
      await pulseClick(token);
    }
    await wait(350);
    if (token !== autoplayToken) return false;
    scene.removeSelected();
    selectedPlacement.value = false;
    await wait(250);
    if (token !== autoplayToken) return false;
  }
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
    // Two drags, then the double-click route, so a lap shows both ways in and that each
    // one leaves exactly one object behind.
    for (let i = 0; i < DROP_POINTS.length - 1; i += 1) {
      const [fx, fy] = DROP_POINTS[i];
      const ok = await dragAndOrbit(token, scene, root, 'chair', fx, fy, i % 2 === 0 ? 1 : -1);
      if (!ok) break outer;
    }
    const [lastX, lastY] = DROP_POINTS[DROP_POINTS.length - 1];
    if (!await armAndClick(token, scene, root, CLICK_ROUTE_ID, lastX, lastY)) break outer;
    // Hold the fully-built scene a beat, then delete what the lap placed before the next.
    await wait(900);
    if (token !== autoplayToken) break;
    if (!await removePlaced(token, scene)) break;
    await wait(500);
  }
  // A stale run reaching here (superseded mid-flight) must leave the current
  // run's state alone — stopAutoplay() already did this run's own cleanup.
  if (token === autoplayToken) demoPlaying.value = false;
}

function startAutoplay() {
  if (reducedMotion) {
    reportAutoplayState(rootRef.value, 'off');
    return;
  }
  // An object the visitor is still carrying is theirs to put down; taking the scene back
  // mid-placement would drop it for them.
  if (userControl || !chairsReady || !inView || phase.value !== 'idle') return;
  autoplayToken += 1;
  reportAutoplayState(rootRef.value, 'playing');
  void runAutoplay();
}

function stopAutoplay() {
  autoplayToken += 1;
  demoPlaying.value = false;
  cursorVisible.value = false;
  draggedThumb.value = null;
  pendingDrag = null;
  if (draggingItem || phase.value !== 'idle') {
    sceneRef.value?.setGhostVisible(false);
    draggingItem = null;
    armedItem.value = null;
    phase.value = 'idle';
  }
}

function restartDemo() {
  stopAutoplay();
  userControl = false;
  sceneRef.value?.reset();
  selectedPlacement.value = false;
  startAutoplay();
}

// Every caller is a deliberate grab at the catalog or the scene, so the visitor keeps
// control until they ask for the walkthrough back from the sheet's status chip.
function yieldToUser() {
  if (demoPlaying.value) stopAutoplay();
  userControl = true;
  reportAutoplayState(rootRef.value, 'user');
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
    const { SpaceBuilderScene } = await import(
      '@/components/SpaceBuilderDemo/MockScene/scene/SpaceBuilderScene'
    );
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
      console.debug('Drag and drop scene chair failed to load', error);
    });

    const visibilityRoot =
      root.closest<HTMLElement>('article.technical-drawing-stack > * > section') ?? root;
    stopPageWatch = watchPageActive(visibilityRoot, (active) => {
      inView = active;
      if (!active) {
        releaseSpaceBuilderGpu(scene);
        stopAutoplay();
        return;
      }
      claimSpaceBuilderGpu(scene);
      startAutoplay();
    });

    // Hold the demo still while the note dialog covers this page.
    stopNoteWatch = watchDrawingNote(visibilityRoot, (open) => {
      if (open) {
        stopAutoplay();
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
    console.debug('Drag and drop scene failed to start', error);
    loadError.value = true;
  }
});

onBeforeUnmount(() => {
  stopPageWatch?.();
  stopPageWatch = null;
  stopNoteWatch?.();
  stopNoteWatch = null;
  autoplayToken += 1;
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
    class="drag-drop-scene-app"
    tabindex="0"
    :data-ready="ready ? 'true' : 'false'"
    :data-phase="phase"
    :data-selected="selectedPlacement ? 'true' : 'false'"
    aria-label="Drag and drop demo, autoplaying the Add tool; drag a catalog card onto the floor, or double-click one and click where it goes"
    @keydown="onKeyDown"
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

      <div v-if="arming" class="arming-cover" role="status">
        <span class="spinner" aria-hidden="true" />
        <span>Loading the model…</span>
      </div>

      <p v-if="demoPlaying" class="demo-flash" role="status">{{ autoplayStartedToast().action }}</p>

      <div v-if="toast" class="toast" aria-live="polite">{{ toast }}</div>

      <div v-if="ready && !loadError" class="controls">
        <button type="button" class="restart-btn" @click="restartDemo">
          Restart
        </button>
      </div>
    </div>

    <aside class="sidebar" aria-label="Select an Object" @pointerdown="yieldToUser" @focusin="yieldToUser">
      <header class="sidebar-header">
        <h3 class="sidebar-title">Select an Object</h3>
      </header>
      <div class="sidebar-body">
        <CatalogPanel
          :items="DND_ITEMS"
          :selected-id="selectedId"
          :native-drag="false"
          @select="selectItem"
          @confirm="confirmItem"
          @dragstart="onItemDragStart"
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
      data-demo-cursor
      :class="{ clicking: cursorClicking, instant: cursorInstant }"
      :style="{ left: `${cursorPos.x}px`, top: `${cursorPos.y}px` }"
      aria-hidden="true"
    >
      <svg viewBox="0 0 32 32" width="40" height="40">
        <path
          d="M4 2.5v24.2l6.4-6.2 4.1 9.7 4.2-1.8-4.1-9.6H26z"
          fill="#fff"
          stroke="var(--accent, #222)"
          stroke-width="1.6"
          stroke-linejoin="round"
        />
      </svg>
      <span class="demo-cursor-label">demo</span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
$visrez-brand: #89ab24;
$light-grey: #565656;
$nav-sidebar-bg: #323232;
$scene-bg: #212121;

.drag-drop-scene-app {
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
  animation: drag-drop-spin 0.8s linear infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
    border-color: $visrez-brand;
  }
}

// Space Builder covers the page with `.cover-spin` on this route, so a click cannot land
// before the model does.
.arming-cover {
  position: absolute;
  inset: 0;
  z-index: 4;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 0.65rem;
  background: color-mix(in oklab, $scene-bg 72%, transparent);
  color: #e8e4dc;
  font: 0.8rem/1.3 var(--font-poppins, system-ui, sans-serif);
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

.controls {
  position: absolute;
  left: 50%;
  bottom: 0.55rem;
  z-index: 2;
  translate: -50% 0;
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

  // Says out loud that this arrow is the walkthrough's, not the visitor's pointer.
  .demo-cursor-label {
    position: absolute;
    left: 1.75em;
    top: 1.5em;
    padding: 0 0.25em;
    border: 1px solid var(--accent, #222);
    border-radius: 0.25em;
    background: #fff;
    color: #222;
    font: 0.625rem/1.5 monospace;
    letter-spacing: 0.08em;
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

</style>
