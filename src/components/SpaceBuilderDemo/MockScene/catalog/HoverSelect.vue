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
  /**
   * Row name for a printed option that does not say what it is ("Size" for "1.8m x 76cm"):
   * the summary is then named "<label>, <currentText>". A seat count prints "8 seats" and
   * needs none, so its summary keeps its visible text as its name.
   */
  label?: string;
  /** Printed text of the current option, for the name built from `label`. */
  currentText?: string;
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
const root = ref<HTMLDetailsElement | null>(null);

/** Closing hides the options, so focus left on one is moved to the summary first. */
function returnFocus() {
  const summary = root.value?.querySelector<HTMLElement>(':scope > summary');
  if (root.value?.contains(document.activeElement) && document.activeElement !== summary) summary?.focus();
}

function isUnavailable(option: HoverSelectOption) {
  return props.unavailable?.includes(option) ?? false;
}

function onToggle(event: Event) {
  expanded.value = (event.target as HTMLDetailsElement).open;
  if (expanded.value) emit('seen');
  else emit('revert');
}

function close() {
  returnFocus();
  // The details' own toggle event lands a task later, too late for a quick Escape to see it open.
  if (root.value) root.value.open = false;
  expanded.value = false;
}

function pick(option: HoverSelectOption) {
  returnFocus();
  expanded.value = false;
  emit('pick', option);
}
</script>

<template>
  <details
    ref="root"
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
      :aria-label="label ? `${label}, ${currentText}` : undefined"
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
