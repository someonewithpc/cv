<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue';

import { watchDrawingNote } from '@/client/drawingNote';
import { watchPageActive } from '@/client/frontPage';
import CatalogObjectCard from '@/components/SpaceBuilderDemo/MockScene/catalog/CatalogObjectCard.vue';
import { variantOf, variantsOf, type CatalogItem, type CatalogVariant } from '@/components/SpaceBuilderDemo/MockScene/catalogItems';
import { RAIL_TOOLS } from '@/components/SpaceBuilderDemo/MockScene/railTools';
import type { SpaceBuilderScene } from '@/components/SpaceBuilderDemo/MockScene/scene/SpaceBuilderScene';

import { AUTOPLAY_STEPS, findTarget, runStep } from './autoplay';
import { placeVariants } from './placeVariants';
import { CARD_SPOTS, VARIANT_CARDS } from './variantsCatalog';

const CURSOR_TRAVEL_MS = 560;
const CURSOR_CLICK_MS = 260;
const CURSOR_FADE_MS = 420;
const RESUME_DELAY_MS = 6000;
const TOAST_VISIBLE_MS = 2200;
const TOAST_EXIT_MS = 320;

type Toast = { id: number; text: string; leaving: boolean };

const rootRef = ref<HTMLElement | null>(null);
const ready = ref(false);
const loadError = ref(false);
const userControl = ref(false);
const cursorPhase = ref<'demo' | 'fading' | 'gone'>('gone');
const cursorPos = reactive({ x: 0, y: 0 });
const cursorClicking = ref(false);
const toasts = ref<Toast[]>([]);

const picked = reactive<Record<string, string>>({});
const sceneRef = shallowRef<SpaceBuilderScene | null>(null);

let toastId = 0;
let playToken = 0;
let resumeTimer: ReturnType<typeof setTimeout> | null = null;
let fadeTimer: ReturnType<typeof setTimeout> | null = null;
let clickTimer: ReturnType<typeof setTimeout> | null = null;
let stopPageWatch: (() => void) | null = null;
let stopNoteWatch: (() => void) | null = null;
let placeToken = 0;
let active = false;

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function pushToast(text: string) {
  const id = ++toastId;
  toasts.value = [...toasts.value.filter((t) => !t.leaving), { id, text, leaving: false }];
  setTimeout(() => {
    toasts.value = toasts.value.map((t) => (t.id === id ? { ...t, leaving: true } : t));
    setTimeout(() => {
      toasts.value = toasts.value.filter((t) => t.id !== id);
    }, TOAST_EXIT_MS);
  }, TOAST_VISIBLE_MS);
}

function currentPicks() {
  return VARIANT_CARDS.map((card) => ({
    item: card,
    variant: variantOf(card, picked[card.id]),
    spot: CARD_SPOTS[card.id],
  }));
}

async function rebuild() {
  const scene = sceneRef.value;
  if (!scene) return;
  const token = ++placeToken;
  await placeVariants(scene, currentPicks(), () => token !== placeToken);
}

function onSelect(item: CatalogItem, variant: CatalogVariant) {
  picked[item.id] = variant.id;
  void rebuild();
}

function toRootPoint(clientX: number, clientY: number) {
  const rect = rootRef.value?.getBoundingClientRect();
  if (!rect) return { x: clientX, y: clientY };
  return { x: clientX - rect.left, y: clientY - rect.top };
}

function aimCursor(el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  const moved = Math.abs(cursorPos.x) + Math.abs(cursorPos.y) > 0;
  const point = toRootPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  const travels = !moved
    || Math.hypot(point.x - cursorPos.x, point.y - cursorPos.y) > 8;
  cursorPos.x = point.x;
  cursorPos.y = point.y;
  if (cursorPhase.value === 'gone') cursorPhase.value = 'demo';
  return travels;
}

function flashClick() {
  cursorClicking.value = true;
  if (clickTimer) clearTimeout(clickTimer);
  clickTimer = setTimeout(() => {
    cursorClicking.value = false;
  }, CURSOR_CLICK_MS);
}

function wait(ms: number, token: number) {
  return new Promise<void>((resolve) => {
    setTimeout(() => resolve(), token === playToken ? ms : 0);
  });
}

async function play() {
  const token = ++playToken;
  cursorPhase.value = 'demo';
  for (let index = 0; token === playToken; index += 1) {
    const step = AUTOPLAY_STEPS[index % AUTOPLAY_STEPS.length];
    if (index > 0 && index % AUTOPLAY_STEPS.length === 0) {
      VARIANT_CARDS.forEach((card) => { delete picked[card.id]; });
      await rebuild();
    }
    await wait(step.delay, token);
    if (token !== playToken) return;

    const root = rootRef.value;
    const el = root ? findTarget(root, step.aim) : null;
    if (!el) continue;
    if (aimCursor(el)) await wait(CURSOR_TRAVEL_MS, token);
    if (token !== playToken) return;
    if (step.act === 'click') flashClick();
    if (step.say) pushToast(step.say);
    runStep(el, step.act);
  }
}

function stopPlaying() {
  playToken += 1;
}

function yieldToUser() {
  if (userControl.value) {
    restartIdleTimer();
    return;
  }
  userControl.value = true;
  stopPlaying();
  pushToast('Demo paused');
  if (cursorPhase.value === 'demo') {
    cursorPhase.value = 'fading';
    if (fadeTimer) clearTimeout(fadeTimer);
    fadeTimer = setTimeout(() => {
      cursorPhase.value = 'gone';
    }, CURSOR_FADE_MS);
  } else {
    cursorPhase.value = 'gone';
  }
  restartIdleTimer();
}

function restartIdleTimer() {
  if (resumeTimer) clearTimeout(resumeTimer);
  resumeTimer = setTimeout(() => {
    resumeTimer = null;
    if (!active || reducedMotion()) return;
    userControl.value = false;
    pushToast('Demo playing · move to take over');
    void play();
  }, RESUME_DELAY_MS);
}

function onTrustedPointer(event: PointerEvent) {
  if (!event.isTrusted || !active) return;
  const host = rootRef.value;
  const target = event.target;
  if (!host || !(target instanceof Node) || !host.contains(target)) return;
  yieldToUser();
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
    const { SpaceBuilderScene } = await import('@/components/SpaceBuilderDemo/MockScene/scene/SpaceBuilderScene');
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });

    const scene = new SpaceBuilderScene({ canvas, labelHost });
    scene.pause();
    sceneRef.value = scene;
    // Extras convert to metres by the chair's own measured height, so the chair has to load
    // even on a page that never places one.
    await scene.loadChair();
    // Read every style's GLB up front. A pick clears the floor and builds it again, so a
    // model still being parsed would show as a hole where the object was.
    for (const card of VARIANT_CARDS) {
      for (const variant of variantsOf(card)) scene.activateCatalogItem(card.id, variant);
    }

    scene.setTagSuppressed(true);
    scene.setHandlesVisible(false);
    scene.setCameraAngles(Math.PI * 0.26, Math.PI * 0.36);
    scene.setOrbitRadius(7.6);

    ready.value = true;
    requestAnimationFrame(() => {
      scene.forceResize();
      requestAnimationFrame(() => {
        scene.forceResize();
        void rebuild();
      });
    });

    const page = root.closest<HTMLElement>('article.technical-drawing-stack > * > section') ?? root;
    stopPageWatch = watchPageActive(page, (visible) => {
      active = visible;
      if (!visible) {
        stopPlaying();
        cursorPhase.value = 'gone';
        scene.pause();
        scene.releaseGpu();
        return;
      }
      scene.attachGpu();
      scene.resume();
      if (!userControl.value && !reducedMotion()) void play();
    });

    stopNoteWatch = watchDrawingNote(page, (open) => {
      if (open) {
        stopPlaying();
        scene.pause();
        return;
      }
      scene.resume();
      if (active && !userControl.value && !reducedMotion()) void play();
    });

    window.addEventListener('pointerdown', onTrustedPointer);
    window.addEventListener('pointermove', onTrustedPointer);
  } catch (error) {
    console.debug('Variants scene failed to start', error);
    loadError.value = true;
  }
});

onBeforeUnmount(() => {
  stopPlaying();
  stopPageWatch?.();
  stopNoteWatch?.();
  if (resumeTimer) clearTimeout(resumeTimer);
  if (fadeTimer) clearTimeout(fadeTimer);
  if (clickTimer) clearTimeout(clickTimer);
  const scene = sceneRef.value;
  scene?.pause();
  scene?.releaseGpu();
  scene?.dispose();
  sceneRef.value = null;
  window.removeEventListener('pointerdown', onTrustedPointer);
  window.removeEventListener('pointermove', onTrustedPointer);
});
</script>

<template>
  <div
    ref="rootRef"
    class="variants-app"
    tabindex="0"
    role="application"
    aria-label="Space Builder object variants demo"
    :data-ready="ready ? 'true' : 'false'"
    :data-user-control="userControl ? 'true' : 'false'"
    @focus="yieldToUser"
  >
    <aside class="rail" aria-label="Tools">
      <div class="rail-logo" aria-hidden="true" title="Visrez">
        <img class="rail-logo-img" src="/demos/space-builder/builder-logo.png" alt="" width="40" height="40">
      </div>
      <button
        v-for="tool in RAIL_TOOLS"
        :key="tool.id"
        type="button"
        class="tool"
        :class="{ active: tool.id === 'replace', muted: tool.id !== 'replace' }"
        :disabled="tool.id !== 'replace'"
        :tabindex="tool.id === 'replace' ? undefined : -1"
        :title="tool.title"
      >
        <span
          class="tool-icon"
          :style="{ '--tool-icon': `url(${tool.icon})` }"
          aria-hidden="true"
        />
      </button>
    </aside>

    <div class="viewport">
      <canvas data-scene-canvas class="scene-canvas" aria-label="Two objects on a demo floor" />
      <div data-label-host class="label-host" />

      <div
        v-if="!ready || loadError"
        class="boot-cover"
        :class="{ error: loadError }"
        :role="loadError ? 'status' : undefined"
      >
        <span v-if="!loadError" class="spinner" aria-hidden="true" />
        <span>{{ loadError ? '3D scene unavailable — the blueprint pages explain the picker' : 'Loading scene…' }}</span>
      </div>

      <div class="toasts" aria-live="polite">
        <div v-for="toast in toasts" :key="toast.id" class="toast" :class="{ leaving: toast.leaving }">
          {{ toast.text }}
        </div>
      </div>
    </div>

    <aside class="sidebar" aria-label="Replace tool">
      <header class="sidebar-header">
        <h3 class="sidebar-title">Select an Object</h3>
      </header>
      <div class="sidebar-body">
        <CatalogObjectCard
          v-for="card in VARIANT_CARDS"
          :key="card.id"
          :item="card"
          :variant-id="picked[card.id]"
          :active="true"
          :native-drag="false"
          @update:variant-id="picked[card.id] = $event"
          @select="onSelect"
        />
      </div>
    </aside>

    <span
      v-if="cursorPhase !== 'gone'"
      class="demo-cursor"
      :class="[`demo-cursor--${cursorPhase}`, { 'demo-cursor--clicking': cursorClicking }]"
      :style="{ left: `${cursorPos.x}px`, top: `${cursorPos.y}px` }"
      aria-hidden="true"
    />
  </div>
</template>

<style lang="scss">
@use './appShell';
</style>
