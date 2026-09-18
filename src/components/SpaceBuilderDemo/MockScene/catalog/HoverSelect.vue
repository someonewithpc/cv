<script setup lang="ts">
import { ref } from 'vue';

export type HoverSelectOption = string | number;

const props = defineProps<{
  options: HoverSelectOption[];
  current: HoverSelectOption | null;
  /** Options that cannot combine with the rest of the current pick; drawn muted. */
  unavailable?: HoverSelectOption[];
  /** Accessible name for the control, e.g. "Seats". */
  label: string;
}>();

const emit = defineEmits<{
  pick: [option: HoverSelectOption];
  hover: [option: HoverSelectOption];
}>();

const expanded = ref(false);
const initial = ref<HoverSelectOption | null>(null);

function isUnavailable(option: HoverSelectOption) {
  return props.unavailable?.includes(option) ?? false;
}

function toggle() {
  if (expanded.value) {
    collapse();
    return;
  }
  initial.value = props.current;
  expanded.value = true;
}

function collapse() {
  if (!expanded.value) return;
  expanded.value = false;
  // Space Builder puts the preview back when the pointer leaves without a pick.
  if (initial.value !== null) emit('hover', initial.value);
}

function pick(option: HoverSelectOption) {
  expanded.value = false;
  emit('pick', option);
}
</script>

<template>
  <div v-if="options.length <= 1" class="hover-select single">
    <slot name="option" :option="current" />
  </div>

  <div
    v-else
    class="hover-select"
    :class="{ expanded }"
    @mouseleave="collapse"
    @keydown.esc.stop="collapse"
  >
    <button
      type="button"
      class="hover-select-current"
      :aria-expanded="expanded"
      :aria-label="`${label}, ${current}`"
      @click.stop="toggle"
      @dblclick.stop
    >
      <slot name="option" :option="current" />
      <svg class="caret" viewBox="0 0 320 512" width="8" height="8" aria-hidden="true">
        <path fill="currentColor" d="M31 175h258c18 0 27 21 14 34L174 338a20 20 0 0 1-28 0L17 209c-13-13-4-34 14-34z" />
      </svg>
    </button>

    <ul v-show="expanded" class="hover-select-options">
      <li v-for="option in options" :key="option" :class="{ unavailable: isUnavailable(option) }">
        <button
          type="button"
          @click.stop="pick(option)"
          @dblclick.stop
          @mouseover="emit('hover', option)"
          @focus="emit('hover', option)"
        >
          <slot name="option" :option="option" />
        </button>
      </li>
    </ul>
  </div>
</template>

<style lang="scss" scoped>
// Space Builder's own dropdown (forms/HoverSelect.vue + ui/custom/components/_hover_select.scss).
// The product marks it up as `ul[role=select]`, which is not a real ARIA role; this keeps the
// look and the hover-to-preview behaviour but builds it out of plain buttons.
$border: #3d4246;
$row-bg: #212529;

.hover-select {
  position: relative;
  text-align: center;

  &.single {
    padding: 0 0.125rem;
  }
}

.hover-select-current,
.hover-select-options button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  width: 100%;
  padding: 0 0.25rem;
  border: 1px solid transparent;
  background: transparent;
  color: inherit;
  font: inherit;
  line-height: 1.5;
  white-space: nowrap;
  cursor: pointer;
}

.hover-select-current {
  border-color: $border;
  border-radius: 0.25rem;

  .caret {
    position: absolute;
    right: 0.5rem;
    pointer-events: none;
  }

  &:hover {
    box-shadow: inset 0 0 0.125rem 0.625rem color-mix(in srgb, #{$border} 80%, #495057);
  }
}

.hover-select-options {
  position: absolute;
  z-index: 5;
  top: 100%;
  right: 0;
  left: 0;
  margin: -1px 0 0;
  padding: 0;
  list-style: none;
  background: $row-bg;
  border: 1px solid $border;
  border-top: 0;
  border-bottom-right-radius: 0.25rem;
  border-bottom-left-radius: 0.25rem;

  li + li button {
    border-top: 1px solid color-mix(in srgb, #{$border} 50%, transparent);
  }

  li.unavailable {
    color: #868e96;
  }

  button:hover {
    box-shadow: inset 0 0 0.125rem 0.625rem color-mix(in srgb, #{$border} 80%, #495057);
  }
}

.expanded .hover-select-current {
  border-bottom-right-radius: 0;
  border-bottom-left-radius: 0;
}
</style>
