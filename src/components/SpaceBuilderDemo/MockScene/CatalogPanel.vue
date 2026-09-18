<script setup lang="ts">
import { computed, ref } from 'vue';

import type { CatalogItem } from './catalogItems';

const props = withDefaults(defineProps<{
  items: CatalogItem[];
  selectedId: string;
  /** Set the native `draggable` attribute + fire dragstart/dragend (desktop mouse only). */
  nativeDrag?: boolean;
}>(), {
  nativeDrag: true,
});

const emit = defineEmits<{
  select: [item: CatalogItem];
  confirm: [item: CatalogItem];
  dragstart: [event: DragEvent, item: CatalogItem];
  dragend: [];
  itemPointerdown: [event: PointerEvent, item: CatalogItem];
}>();

const search = ref('');

const itemsVisible = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return props.items;
  return props.items.filter((item) => item.name.toLowerCase().includes(q));
});
</script>

<template>
  <label class="catalog-search">
    <span class="visually-hidden">Search by name</span>
    <input
      v-model="search"
      type="search"
      placeholder="Search by name"
      autocomplete="off"
      @keydown.stop
    >
  </label>

  <p v-if="itemsVisible.length === 0" class="catalog-empty">
    Search does not match any object.
  </p>

  <div v-else class="catalog-grid">
    <button
      v-for="item in itemsVisible"
      :key="item.id"
      type="button"
      class="option-item"
      :class="{ active: selectedId === item.id, placeholder: !item.real }"
      :data-demo-target="`catalog:${item.id}`"
      :draggable="nativeDrag && Boolean(item.real)"
      :title="!item.real ? `${item.name} (placeholder)` : item.layoutable ? `${item.name} · double-click to Build` : `${item.name} · drag to place`"
      @click="emit('select', item)"
      @dblclick="emit('confirm', item)"
      @dragstart="emit('dragstart', $event, item)"
      @dragend="emit('dragend')"
      @pointerdown="emit('itemPointerdown', $event, item)"
    >
      <div class="object-icons">
        <img :src="item.thumb" alt="" width="600" height="600">
      </div>
      <span class="item-label">
        <span class="object-name">{{ item.name }}</span>
        <span v-if="item.size" class="object-size">
          <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
            <path
              d="M2 9h20v6H2zM6 9v3M10 9v4M14 9v3M18 9v4"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
          </svg>
          {{ item.size }}
        </span>
      </span>
    </button>
  </div>
</template>

<style lang="scss" scoped>
// Space Builder's own accent (ui/main.scss `$visrez-brand`), which the rest of the demo
// already uses; the catalog was the one panel still on Inspinia's default teal.
$brand: #89ab24;

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
      border-color: $brand;
      box-shadow: 0 0 0 0.2rem rgba(137, 171, 36, 0.25);
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
  // Space Builder lays the catalog out three across in a 780px sidebar; this one is a
  // third of that, so keep its card size and let as many columns fit as will.
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  align-content: start;
  grid-auto-rows: 1fr;

  // Matches the rail-hide breakpoint in MockSceneApp.vue — below it the
  // sidebar is too narrow for two columns of thumbnails to stay legible.
  @container (max-width: 34rem) {
    grid-template-columns: minmax(0, 1fr);
  }
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
  // darken($secondary, 20%) in _catalog_object_field.scss.
  border: 1px solid #3d4246;
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
    border-color: #6c757d;
  }

  &.active {
    box-shadow: 0 0 0 0.2rem rgba(137, 171, 36, 0.25);

    .item-label {
      background: $brand;
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
    // Square tile with the model floating on the gradient — the thumbnails are
    // transparent, as the product's are.
    aspect-ratio: 1;
    background: linear-gradient(59deg, #dee2e6 0%, #adb5bd 100%);

    img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
      padding: 0.5rem;
    }
  }

  .item-label {
    display: block;
    margin: 0;
    padding: 0.25rem 0.375rem;
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

    .object-size {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.25rem;
      overflow: hidden;
      font-size: 0.6875rem;
      font-weight: 400;
      white-space: nowrap;
      color: #ced4da;

      svg {
        flex: 0 0 auto;
      }
    }
  }
}
</style>
