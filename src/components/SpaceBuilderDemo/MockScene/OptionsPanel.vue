<script setup lang="ts">
import { computed } from 'vue';

import { LAYOUT_ICONS } from './layoutIcons';
import {
  DEFAULT_LAYOUT_OPTIONS,
  LAYOUT_LABELS,
  LAYOUT_STYLES,
  isAisleEnabled,
  uiFieldsForStyle,
  type LayoutStyle,
  type UiFieldId,
} from './scene/layoutEngine';
import type { SceneSnapshot } from './scene/SpaceBuilderScene';

const props = withDefaults(defineProps<{
  snapshot: SceneSnapshot | null;
  seatsInvalid: boolean;
  showSeats?: boolean;
  showSpacing?: boolean;
  showLayouts?: boolean;
  openSeats?: boolean;
  openSpacing?: boolean;
  openLayouts?: boolean;
}>(), {
  showSeats: true,
  showSpacing: true,
  showLayouts: true,
  openSeats: true,
  openSpacing: true,
  openLayouts: true,
});

const emit = defineEmits<{
  seats: [value: number];
  blockWidth: [value: number];
  blockHeight: [value: number];
  distanceX: [value: number];
  distanceZ: [value: number];
  aisle: [value: number];
  offset: [value: number];
  angle: [value: number];
  innerDiameter: [value: number];
  style: [value: LayoutStyle];
}>();

const layoutStyle = computed(() => props.snapshot?.options.style ?? 'grid');
const activeFields = computed(() => uiFieldsForStyle(layoutStyle.value));
const aisleEnabled = computed(() => {
  if (!activeFields.value.has('aisle')) return false;
  const opts = props.snapshot?.options ?? DEFAULT_LAYOUT_OPTIONS;
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

function numberFromEvent(event: Event) {
  const value = Number((event.target as HTMLInputElement).value);
  return Number.isFinite(value) ? value : 0;
}

function blockFromEvent(event: Event) {
  const raw = (event.target as HTMLInputElement).value;
  const value = raw === '' ? 0 : Number(raw);
  return Number.isFinite(value) ? value : 0;
}
</script>

<template>
  <details v-if="showSeats" class="options-section" :open="openSeats">
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
        @change="emit('seats', numberFromEvent($event))"
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
          type="text"
          inputmode="numeric"
          pattern="[0-9]*"
          placeholder="Chairs"
          :value="snapshot?.options.blocks.width || ''"
          :disabled="!fieldActive('blocks')"
          @input="emit('blockWidth', blockFromEvent($event))"
          @change="emit('blockWidth', blockFromEvent($event))"
        >
        <span class="times" aria-hidden="true">×</span>
        <input
          type="text"
          inputmode="numeric"
          pattern="[0-9]*"
          placeholder="Rows"
          :value="snapshot?.options.blocks.height || ''"
          :disabled="!fieldActive('blocks')"
          @input="emit('blockHeight', blockFromEvent($event))"
          @change="emit('blockHeight', blockFromEvent($event))"
        >
      </div>
    </label>
  </details>

  <details v-if="showSpacing" class="options-section" :open="openSpacing">
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
        @input="emit('distanceX', numberFromEvent($event))"
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
        @input="emit('distanceZ', numberFromEvent($event))"
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
        @input="emit('aisle', numberFromEvent($event))"
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
        @input="emit('offset', numberFromEvent($event))"
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
        @input="emit('angle', numberFromEvent($event))"
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
        :max="snapshot?.innerDiameterMax ?? 4"
        step="0.05"
        :value="Math.min(snapshot?.options.innerDiameter ?? 0, snapshot?.innerDiameterMax ?? 4)"
        :disabled="!fieldActive('innerDiameter')"
        @input="emit('innerDiameter', numberFromEvent($event))"
      >
    </label>
  </details>

  <details v-if="showLayouts" class="options-section" :open="openLayouts">
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
        @click="emit('style', style)"
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

<style lang="scss" scoped>
$visrez-brand: #89ab24;
$light-grey: #565656;
$nav-second-bg: #151515;

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
  input[type='text'],
  input[type='range'] {
    width: 100%;
  }

  input[type='number'],
  input[type='text'] {
    min-width: 0;
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

    input[type='number']:disabled,
    input[type='text']:disabled {
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

  // Matches the narrow-frame breakpoint in MockSceneApp.vue / ParametersSceneApp.vue.
  @container (max-width: 34rem) {
    grid-template-columns: 1fr;
  }
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
</style>
