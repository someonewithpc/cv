<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { variantsOf, type CatalogItem, type CatalogVariant } from '../catalogItems';
import HoverSelect from './HoverSelect.vue';
import VariationCarousel from './VariationCarousel.vue';

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

const variants = computed(() => variantsOf(props.item));
const localId = ref(props.variantId ?? variants.value[0].id);

watch(() => props.variantId, (id) => {
  if (id) localId.value = id;
});

const visible = computed(
  () => variants.value.find((v) => v.id === localId.value) ?? variants.value[0],
);

/** Styles that differ only in finish, which is what the thumbnail carousel steps through. */
const styles = computed(() => variants.value.filter(
  (v) => v.pax === visible.value.pax && v.size === visible.value.size,
));
const styleIndex = computed(() => Math.max(0, styles.value.indexOf(visible.value)));

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

function show(variant: CatalogVariant | undefined) {
  if (!variant) return;
  localId.value = variant.id;
  emit('update:variantId', variant.id);
}

function pick(variant: CatalogVariant | undefined) {
  if (!variant) return;
  show(variant);
  emit('select', props.item, variant);
}

/** Keep as much of the current pick as the library allows, the way the product does. */
function byPax(pax: string | number) {
  return variants.value.find((v) => (v.pax ?? 0) === Number(pax) && v.size === visible.value.size)
    ?? variants.value.find((v) => (v.pax ?? 0) === Number(pax));
}

function bySize(size: string | number) {
  return variants.value.find((v) => v.size === size && v.pax === visible.value.pax)
    ?? variants.value.find((v) => v.size === size);
}

function onStyleIndex(index: number) {
  const variant = styles.value[index];
  if (!variant) return;
  show(variant);
  // The product commits a style change only for the card already in play.
  if (props.active) emit('select', props.item, variant);
}
</script>

<template>
  <div
    class="option-item"
    :class="{ active, placeholder: !item.real, group: styles.length > 1 }"
    :data-catalog-item="item.id"
  >
    <div class="thumbnail" :class="{ group: styles.length > 1 }">
      <button
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
        <span v-if="styles.length === 1 && variants.length > 1" class="group-object-count">
          {{ variants.length }}
        </span>
      </button>

      <VariationCarousel
        v-if="styles.length > 1"
        :variants="styles"
        :index="styleIndex"
        @update:index="onStyleIndex"
      />
    </div>

    <div class="item-label">
      <span class="object-name">{{ item.name }}</span>

      <HoverSelect
        v-if="showPax"
        class="object-pax"
        label="Seats"
        :options="paxOptions"
        :current="visible.pax ?? 0"
        :unavailable="unavailablePax"
        @pick="pick(byPax($event))"
        @hover="show(byPax($event))"
      >
        <template #option="{ option }">
          <svg viewBox="0 0 448 512" width="10" height="10" aria-hidden="true">
            <path
              fill="currentColor"
              d="M224 256a112 112 0 1 0 0-224 112 112 0 0 0 0 224zm-64 48C71 304 0 375 0 464c0 26 22 48 48 48h352c26 0 48-22 48-48 0-89-71-160-160-160h-128z"
            />
          </svg>
          {{ option }} seats
        </template>
      </HoverSelect>

      <HoverSelect
        v-if="showSize"
        class="object-size"
        label="Size"
        :options="sizeOptions"
        :current="visible.size ?? ''"
        :unavailable="unavailableSize"
        @pick="pick(bySize($event))"
        @hover="show(bySize($event))"
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
          {{ option }}
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
        {{ visible.size }}
      </span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// Space Builder's catalog card (forms/CatalogObjectField.vue, _catalog_object_field.scss,
// _catalog_styles_group_field.scss).
$brand: #89ab24;

.option-item {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  // darken($secondary, 20%) in _catalog_object_field.scss.
  border: 1px solid #3d4246;
  border-radius: 0.25rem;
  color: inherit;
  user-select: none;
  --active-pip-color: #6c757d;
  --active-count-color: #6c757d;

  &.placeholder .object-icons {
    // Same tile chrome as real items — just mute the silhouette.
    filter: grayscale(1);

    img {
      opacity: 0.45;
    }
  }

  &.placeholder .item-label {
    color: #868e96;
  }

  &:hover:not(.active) {
    border-color: #6c757d;
  }

  &.active {
    box-shadow: 0 0 0 0.2rem rgba(137, 171, 36, 0.25);
    --active-pip-color: #{$brand};
    --active-count-color: #{$brand};

    .item-label {
      background: $brand;
      color: #fff;
    }
  }
}

.thumbnail {
  position: relative;
  isolation: isolate;
  display: flex;
  flex: 1 1 auto;
  border-top-left-radius: 0.25rem;
  border-top-right-radius: 0.25rem;
  overflow: hidden;
}

.object-icons {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  // Square tile with the model floating on the gradient — the thumbnails are
  // transparent, as the product's are.
  aspect-ratio: 1;
  padding: 0;
  border: 0;
  background: linear-gradient(59deg, #dee2e6 0%, #adb5bd 100%);
  cursor: grab;

  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
    padding: 0.5rem;
  }

  .placeholder & {
    cursor: pointer;
  }

  &.is-demo-target {
    box-shadow: inset 0 0 0 0.1875rem rgba(137, 171, 36, 0.65);
  }
}

.group-object-count {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  z-index: 2;
  width: 2em;
  height: 2em;
  border: 1px solid var(--active-count-color);
  border-radius: 100%;
  background: color-mix(in srgb, var(--active-count-color), black 5%);
  color: #fff;
  font-size: 0.75rem;
  line-height: 2em;
  text-align: center;
}

.item-label {
  display: block;
  // Keep the label from widening the grid column when a style name is long.
  width: 0;
  min-width: 100%;
  margin: 0;
  padding: 0.25rem 0.375rem;
  border-bottom-right-radius: 0.25rem;
  border-bottom-left-radius: 0.25rem;
  background: #212529;
  text-align: center;
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1.5;

  .object-name {
    display: block;
    overflow: hidden;
    max-height: 1.5em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :deep(.object-size),
  :deep(.object-pax) {
    font-size: 0.6875rem;
    font-weight: 400;
    color: #ced4da;
  }

  .object-size.static {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    overflow: hidden;
    white-space: nowrap;

    svg {
      flex: 0 0 auto;
    }
  }
}

.active .item-label :deep(.object-size),
.active .item-label :deep(.object-pax) {
  color: rgba(255, 255, 255, 0.85);
}
</style>
