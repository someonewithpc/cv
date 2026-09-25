<script setup lang="ts">
import { computed, reactive, ref } from 'vue';

import CatalogObjectCard from './catalog/CatalogObjectCard.vue';
import type { CatalogItem, CatalogVariant } from './catalogItems';

const props = withDefaults(defineProps<{
  items: CatalogItem[];
  selectedId: string;
  /** Set the native `draggable` attribute + fire dragstart/dragend (desktop mouse only). */
  nativeDrag?: boolean;
}>(), {
  nativeDrag: true,
});

const emit = defineEmits<{
  select: [item: CatalogItem, variant: CatalogVariant];
  confirm: [item: CatalogItem, variant: CatalogVariant];
  dragstart: [event: DragEvent, item: CatalogItem, variant: CatalogVariant];
  dragend: [];
  itemPointerdown: [event: PointerEvent, item: CatalogItem, variant: CatalogVariant];
}>();

const search = ref('');
const variantIds = reactive<Record<string, string>>({});

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

  <!-- `variants-catalog` is what scopes the shared card stylesheet; see the style block. -->
  <div v-else class="catalog-grid variants-catalog">
    <CatalogObjectCard
      v-for="item in itemsVisible"
      :key="item.id"
      v-model:variant-id="variantIds[item.id]"
      :item="item"
      :active="selectedId === item.id"
      :native-drag="nativeDrag"
      @select="(...args) => emit('select', ...args)"
      @confirm="(...args) => emit('confirm', ...args)"
      @dragstart="(...args) => emit('dragstart', ...args)"
      @dragend="emit('dragend')"
      @item-pointerdown="(...args) => emit('itemPointerdown', ...args)"
    />
  </div>
</template>

<!--
  The cards' look, shared with the object variants demo rather than copied: one stylesheet
  for the card, its style carousel and its seats and size rows, scoped under
  `.variants-catalog` so it reaches the cards here and nothing else in the app.
-->
<style lang="scss">
@use '../../VariantsDemo/card';
</style>

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
    font-size: 0.75rem;

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
  font-size: 0.875rem;
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
</style>
