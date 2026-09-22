<script setup lang="ts">
/**
 * One dropdown row of the catalog card: seats, or size. The markup is the object variants
 * demo's (VariantsDemo/Card.astro) — a <details> whose summary is the current option — and
 * the look comes from that demo's card.scss, so both demos draw the product's row from one
 * source. Only the behaviour is Vue's: hover previews an option, a click commits it, and
 * leaving without a click puts the held one back, as Space Builder's HoverSelect.vue does.
 */
import { ref } from 'vue';

export type HoverSelectOption = string | number;

const props = defineProps<{
  options: HoverSelectOption[];
  current: HoverSelectOption | null;
  /** Options that cannot combine with the rest of the current pick; drawn muted. */
  unavailable?: HoverSelectOption[];
  /** Accessible name for the control, e.g. "Seats". */
  label: string;
  /** Printed text of the current option, for the summary's accessible name. */
  currentText: string;
  /** A pick on the other row moved this one: flag it until it is opened or hovered. */
  moved?: boolean;
  /** Aim point for the walkthrough; each option gets `<demoTarget>:<option>`. */
  demoTarget?: string;
}>();

const emit = defineEmits<{
  pick: [option: HoverSelectOption];
  hover: [option: HoverSelectOption];
  /** The row was opened, or the pointer crossed it, so its flag can go. */
  seen: [];
  /** The row closed without a pick; the card puts back what it holds. */
  revert: [];
}>();

const expanded = ref(false);

function isUnavailable(option: HoverSelectOption) {
  return props.unavailable?.includes(option) ?? false;
}

function onToggle(event: Event) {
  expanded.value = (event.target as HTMLDetailsElement).open;
  if (expanded.value) emit('seen');
  else emit('revert');
}

function close() {
  expanded.value = false;
}

function pick(option: HoverSelectOption) {
  expanded.value = false;
  emit('pick', option);
}
</script>

<template>
  <details
    class="hover-select"
    :class="{ 'new-dot': moved }"
    :open="expanded"
    @toggle="onToggle"
    @mouseleave="close"
    @mousemove="emit('seen')"
    @keydown.esc.stop="close"
  >
    <summary
      class="hover-select-current"
      :aria-label="`${label}, ${currentText}`"
      :data-demo-target="demoTarget"
      @dblclick.stop
    >
      <slot name="option" :option="current" />
      <svg class="caret" viewBox="0 0 320 512" width="8" height="8" aria-hidden="true">
        <path fill="currentColor" d="M31 175h258c18 0 27 21 14 34L174 338a20 20 0 0 1-28 0L17 209c-13-13-4-34 14-34z" />
      </svg>
    </summary>

    <ul class="hover-select-options">
      <li
        v-for="option in options"
        :key="option"
        :class="{ unavailable: isUnavailable(option), current: option === current }"
        :data-value="option"
      >
        <button
          type="button"
          :data-demo-target="demoTarget ? `${demoTarget}:${option}` : undefined"
          @click.stop="pick(option)"
          @dblclick.stop
          @mouseover="emit('hover', option)"
          @focus="emit('hover', option)"
        >
          <slot name="option" :option="option" />
        </button>
      </li>
    </ul>
  </details>
</template>
