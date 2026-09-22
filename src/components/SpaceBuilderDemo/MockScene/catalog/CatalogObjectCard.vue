<script setup lang="ts">
/**
 * The catalog card in the Add tool's "Select an Object" sidebar, which is where Space
 * Builder shows an object's variants. The picker itself — the style carousel, its pips and
 * sliding dot, and the seats and size rows — is the object variants demo's, reused here:
 * the markup follows VariantsDemo/Card.astro and the look is that demo's card.scss, pulled
 * in once by CatalogPanel.vue. What stays this demo's own is the scene wiring: drag to
 * place, double-click to Build, and the walkthrough's aim points.
 */
import { computed, nextTick, ref, watch } from 'vue';

import { formatSize, unitsFor } from '@/components/VariantsDemo/units';

import { variantsOf, type CatalogItem, type CatalogVariant } from '../catalogItems';
import HoverSelect from './HoverSelect.vue';

const props = withDefaults(defineProps<{
  item: CatalogItem;
  /** Variant on show. Leave it out and the card keeps its own. */
  variantId?: string;
  /** This card is the catalog's current pick. */
  active?: boolean;
  /** Set the native `draggable` attribute and fire dragstart/dragend. */
  nativeDrag?: boolean;
}>(), {
  variantId: undefined,
  active: false,
  nativeDrag: true,
});

const emit = defineEmits<{
  'update:variantId': [id: string];
  select: [item: CatalogItem, variant: CatalogVariant];
  confirm: [item: CatalogItem, variant: CatalogVariant];
  dragstart: [event: DragEvent, item: CatalogItem, variant: CatalogVariant];
  dragend: [];
  itemPointerdown: [event: PointerEvent, item: CatalogItem, variant: CatalogVariant];
}>();

/** Server output is metric; a US-region visitor reads the same sizes in feet and inches. */
const units = unitsFor(typeof navigator === 'undefined' ? undefined : navigator.language);

/** Arrows and pips are the scroller's own where the browser draws them, as in the panel. */
const hasScrollMarkers = typeof CSS !== 'undefined' && CSS.supports('selector(::scroll-marker)');

const variants = computed(() => variantsOf(props.item));
const localId = ref(props.variantId ?? variants.value[0].id);

const visible = computed(
  () => variants.value.find((v) => v.id === localId.value) ?? variants.value[0],
);

/** Styles that differ only in finish, which is what the thumbnail carousel steps through. */
const styles = computed(() => variants.value.filter(
  (v) => v.pax === visible.value.pax && v.size === visible.value.size,
));
const styleIndex = computed(() => Math.max(0, styles.value.indexOf(visible.value)));
const isGroup = computed(() => styles.value.length > 1);

const paxOptions = computed(() => [...new Set(variants.value.map((v) => v.pax ?? 0))]
  .sort((a, b) => b - a));
const sizeOptions = computed(() => [...new Set(variants.value.map((v) => v.size ?? ''))]
  .filter(Boolean));

const showPax = computed(() => paxOptions.value.length > 1);
const showSize = computed(() => sizeOptions.value.length > 1);

const unavailablePax = computed(() => paxOptions.value.filter(
  (pax) => !variants.value.some((v) => (v.pax ?? 0) === pax && v.size === visible.value.size),
));
const unavailableSize = computed(() => sizeOptions.value.filter(
  (size) => !variants.value.some((v) => v.size === size && v.pax === visible.value.pax),
));

const title = computed(() => {
  if (!props.item.real) return `${props.item.name} (placeholder)`;
  return props.item.layoutable
    ? `${props.item.name} · double-click to Build`
    : `${props.item.name} · drag to place`;
});

/**
 * What the card holds, as against what it shows: a hover preview only shows, and the held
 * object comes back when the pointer leaves without a pick.
 */
const held = ref(visible.value);

/** The last id this card sent up, so the prop coming back is not read as a fresh pick. */
let echoed: string | undefined;

watch(() => props.variantId, (id) => {
  if (!id || id === echoed) return;
  localId.value = id;
  const variant = variants.value.find((v) => v.id === id);
  if (variant) held.value = variant;
});

/** A pick on one row moved the other; that row keeps a red dot until it is noticed. */
const movedRow = ref<'pax' | 'size' | null>(null);

function clearFlag(row: 'pax' | 'size') {
  if (movedRow.value === row) movedRow.value = null;
}

function show(variant: CatalogVariant | undefined) {
  if (!variant) return;
  localId.value = variant.id;
  echoed = variant.id;
  emit('update:variantId', variant.id);
}

function pick(variant: CatalogVariant | undefined) {
  if (!variant) return;
  held.value = variant;
  show(variant);
  emit('select', props.item, variant);
}

/** Keep as much of the current pick as the library allows, the way the product does. */
function byPax(pax: string | number) {
  return variants.value.find((v) => (v.pax ?? 0) === Number(pax) && v.size === held.value.size)
    ?? variants.value.find((v) => (v.pax ?? 0) === Number(pax));
}

function bySize(size: string | number) {
  return variants.value.find((v) => v.size === size && v.pax === held.value.pax)
    ?? variants.value.find((v) => v.size === size);
}

function pickRow(row: 'pax' | 'size', variant: CatalogVariant | undefined) {
  if (!variant) return;
  const before = held.value;
  pick(variant);
  const moved = row === 'pax' ? variant.size !== before.size : variant.pax !== before.pax;
  if (moved) movedRow.value = row === 'pax' ? 'size' : 'pax';
}

// The style carousel. The list scrolls and snaps; which slide it settled on is the pick,
// as VariantsDemo/panel.ts reads it.
const list = ref<HTMLElement | null>(null);

function scrollToStyle(index: number) {
  const el = list.value;
  const slide = el?.children[Math.max(0, Math.min(styles.value.length - 1, index))];
  if (!el || !(slide instanceof HTMLElement)) return;
  el.scrollTo({ left: slide.offsetLeft, behavior: 'smooth' });
}

function onScrollEnd() {
  const el = list.value;
  if (!el) return;
  const index = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
  const variant = styles.value[index];
  if (!variant || variant.id === localId.value) return;
  held.value = variant;
  show(variant);
  // The product commits a style change only for the card already in play.
  if (props.active) emit('select', props.item, variant);
}

// A pick from elsewhere (a dropdown row, or the walkthrough) moves the carousel with it.
watch(styleIndex, async (index) => {
  if (!isGroup.value) return;
  await nextTick();
  const el = list.value;
  if (!el) return;
  if (Math.round(el.scrollLeft / Math.max(1, el.clientWidth)) !== index) scrollToStyle(index);
});

/**
 * Clicking the picture picks what it shows. A trusted click reported by the list itself
 * landed on a scroll button or marker — pseudo-elements with no node of their own — and
 * those only scroll; the walkthrough's own `element.click()` is untrusted and does pick.
 */
function onPictureClick(event: MouseEvent) {
  if (event.isTrusted && event.target === list.value) return;
  pick(visible.value);
}
</script>

<template>
  <div
    class="option-item"
    :class="{ active, placeholder: !item.real, group: isGroup }"
    :data-catalog-item="item.id"
    :data-variant="visible.id"
  >
    <div class="thumbnail" :class="{ group: isGroup }">
      <ul
        v-if="isGroup"
        ref="list"
        class="object-icons styles"
        :aria-label="`${item.name} styles`"
        tabindex="0"
        :data-index="styleIndex"
        :data-demo-target="`catalog:${item.id}`"
        :draggable="nativeDrag && Boolean(item.real)"
        :title="title"
        @click="onPictureClick"
        @dblclick="emit('confirm', item, visible)"
        @dragstart="emit('dragstart', $event, item, visible)"
        @dragend="emit('dragend')"
        @pointerdown="emit('itemPointerdown', $event, item, visible)"
        @scrollend="onScrollEnd"
      >
        <li
          v-for="(style, index) in styles"
          :key="style.id"
          class="style"
          :data-variant="style.id"
          :data-name="style.style"
        >
          <img :src="style.thumb" alt="" width="600" height="600">
          <span class="group-object-count">
            <span>{{ index + 1 }}</span>
            <span class="vr" />
            <span>{{ styles.length }}</span>
          </span>
        </li>
      </ul>

      <span
        v-if="isGroup"
        class="pip-track"
        :style="{ '--pips': styles.length, '--index': styleIndex }"
        aria-hidden="true"
      >
        <span v-for="part in 5" :key="part" class="pip-trail" />
        <span class="active-pip" />
      </span>

      <template v-if="isGroup && !hasScrollMarkers">
        <button
          type="button"
          class="previous"
          :disabled="styleIndex <= 0"
          :aria-label="`Previous style of ${item.name}`"
          @click.stop="scrollToStyle(styleIndex - 1)"
          @dblclick.stop
        >
          <svg viewBox="0 0 256 512" width="10" height="12" aria-hidden="true">
            <path fill="currentColor" d="M31 239 175 95c9-9 24-9 33 0s9 24 0 33L97 256l111 128c9 9 9 24 0 33s-24 9-33 0L31 273a24 24 0 0 1 0-34z" />
          </svg>
        </button>
        <button
          type="button"
          class="next"
          :disabled="styleIndex >= styles.length - 1"
          :aria-label="`Next style of ${item.name}`"
          @click.stop="scrollToStyle(styleIndex + 1)"
          @dblclick.stop
        >
          <svg viewBox="0 0 256 512" width="10" height="12" aria-hidden="true">
            <path fill="currentColor" d="M225 273 81 417c-9 9-24 9-33 0s-9-24 0-33l111-128L48 128c-9-9-9-24 0-33s24-9 33 0l144 144a24 24 0 0 1 0 34z" />
          </svg>
        </button>
        <ul class="pagination-control">
          <li v-for="(style, index) in styles" :key="style.id">
            <button
              type="button"
              :aria-label="style.style"
              :aria-current="index === styleIndex ? 'true' : undefined"
              @click.stop="scrollToStyle(index)"
              @dblclick.stop
            />
          </li>
        </ul>
      </template>

      <button
        v-if="!isGroup"
        type="button"
        class="object-icons"
        :data-demo-target="`catalog:${item.id}`"
        :draggable="nativeDrag && Boolean(item.real)"
        :title="title"
        @click="pick(visible)"
        @dblclick="emit('confirm', item, visible)"
        @dragstart="emit('dragstart', $event, item, visible)"
        @dragend="emit('dragend')"
        @pointerdown="emit('itemPointerdown', $event, item, visible)"
      >
        <img :src="visible.thumb" alt="" width="600" height="600">
        <span v-if="variants.length > 1" class="group-object-count">
          {{ variants.length }}
        </span>
      </button>
    </div>

    <div class="item-label">
      <span class="object-name">{{ item.name }}</span>

      <HoverSelect
        v-if="showPax"
        class="object-pax"
        label="Seats"
        demo-target="variant:pax"
        :options="paxOptions"
        :current="visible.pax ?? 0"
        :current-text="String(visible.pax ?? 0)"
        :unavailable="unavailablePax"
        :moved="movedRow === 'pax'"
        @pick="pickRow('pax', byPax($event))"
        @hover="show(byPax($event))"
        @seen="clearFlag('pax')"
        @revert="show(held)"
      >
        <template #option="{ option }">
          <svg viewBox="0 0 448 512" width="10" height="10" aria-hidden="true">
            <path
              fill="currentColor"
              d="M224 256a112 112 0 1 0 0-224 112 112 0 0 0 0 224zm-64 48C71 304 0 375 0 464c0 26 22 48 48 48h352c26 0 48-22 48-48 0-89-71-160-160-160h-128z"
            />
          </svg>
          <span class="option-text">{{ option }} seats</span>
        </template>
      </HoverSelect>

      <HoverSelect
        v-if="showSize"
        class="object-size"
        label="Size"
        :options="sizeOptions"
        :current="visible.size ?? ''"
        :current-text="formatSize(visible.size ?? '', units)"
        :unavailable="unavailableSize"
        :moved="movedRow === 'size'"
        @pick="pickRow('size', bySize($event))"
        @hover="show(bySize($event))"
        @seen="clearFlag('size')"
        @revert="show(held)"
      >
        <template #option="{ option }">
          <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
            <path
              d="M2 9h20v6H2zM6 9v3M10 9v4M14 9v3M18 9v4"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
          </svg>
          <span class="option-text">{{ formatSize(String(option), units) }}</span>
        </template>
      </HoverSelect>

      <span v-else-if="visible.size" class="object-size static">
        <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
          <path
            d="M2 9h20v6H2zM6 9v3M10 9v4M14 9v3M18 9v4"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
          />
        </svg>
        <span class="option-text">{{ formatSize(visible.size, units) }}</span>
      </span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// Only what the scene wiring adds to the shared card: the placeholder items this demo
// stocks the catalog with, the grab cursor for a drag, and the walkthrough's aim ring.
// Everything else comes from VariantsDemo/card.scss.
.option-item.placeholder {
  :deep(.object-icons) {
    filter: grayscale(1);
    cursor: pointer;

    img {
      opacity: 0.45;
    }
  }

  :deep(.item-label) {
    color: #868e96;
  }
}

.option-item:not(.placeholder) :deep(.object-icons) {
  cursor: grab;
}

:deep(.object-icons.is-demo-target) {
  box-shadow: inset 0 0 0 0.1875rem rgba(137, 171, 36, 0.65);
}
</style>
