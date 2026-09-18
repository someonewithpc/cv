<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import type { CatalogVariant } from '../catalogItems';

const MAX_PIPS = 5;
const PIPS_LOW = Math.floor(MAX_PIPS / 2);
const PIPS_HIGH = Math.ceil(MAX_PIPS / 2);

const props = defineProps<{
  variants: CatalogVariant[];
  /** Index of the variant on show. */
  index: number;
}>();

const emit = defineEmits<{ 'update:index': [index: number] }>();

const shown = ref(props.index);
const target = ref(props.index);
const newImage = ref<HTMLImageElement | null>(null);
let settleTimer = 0;

watch(() => props.index, (value) => {
  if (value === shown.value) return;
  shown.value = value;
  target.value = value;
});

// Key off the styles themselves: the parent rebuilds the array on every pick, and
// resetting on a new array identity would snap the carousel back to the first style.
watch(() => props.variants.map((variant) => variant.id).join(), () => {
  shown.value = props.index;
  target.value = props.index;
});

const hasPrevious = computed(() => shown.value > 0);
const hasNext = computed(() => shown.value < props.variants.length - 1);
const transitionLeft = computed(() => target.value < shown.value);
const transitionRight = computed(() => target.value > shown.value);

const pips = computed(() => {
  const left = shown.value - PIPS_LOW;
  const right = shown.value + PIPS_HIGH;
  const len = props.variants.length;
  const start = Math.max(0, left + (right > len ? len - right : 0));
  const end = Math.min(len, right + (left < 0 ? -left : 0));
  return Array.from({ length: Math.max(0, end - start) }, (_, i) => start + i);
});

/** The pip strip only slides when the window itself has to move under a fixed centre pip. */
const doSlide = computed(() => (
  pips.value.length < props.variants.length
  && (
    pips.value.indexOf(shown.value) === PIPS_LOW
    || (target.value > shown.value && pips.value.indexOf(target.value) > PIPS_LOW)
    || (target.value < shown.value && pips.value.indexOf(target.value) < PIPS_LOW)
  )
  && target.value >= PIPS_LOW
  && target.value < props.variants.length - PIPS_LOW
));

function goTo(index: number) {
  if (index < 0 || index >= props.variants.length) return;
  target.value = index;
  // The slide commits on transitionend; settle anyway if the browser never runs it
  // (an off-screen card, or a theme with transitions turned off).
  window.clearTimeout(settleTimer);
  settleTimer = window.setTimeout(() => {
    if (shown.value === target.value) return;
    shown.value = target.value;
    emit("update:index", target.value);
  }, 600);
}

function settle(event: TransitionEvent) {
  // Both images transition; commit once, on the incoming one.
  if (event.target !== newImage.value) return;
  window.clearTimeout(settleTimer);
  shown.value = target.value;
  emit('update:index', target.value);
}
</script>

<template>
  <div class="overlay">
    <div
      class="transition-img"
      :class="{ 'transition-left': transitionLeft, 'transition-right': transitionRight }"
      @transitionend="settle"
    >
      <img :src="variants[shown].thumb" alt="" width="600" height="600">
      <img ref="newImage" :src="variants[target].thumb" alt="" width="600" height="600">
    </div>

    <span class="group-object-count">
      <span>{{ shown + 1 }}</span>
      <span class="vr" />
      <span>{{ variants.length }}</span>
    </span>

    <button
      type="button"
      class="previous"
      :disabled="!hasPrevious"
      :aria-label="`Previous style of ${variants[shown].style}`"
      @click.stop="goTo(shown - 1)"
      @dblclick.stop
    >
      <svg viewBox="0 0 256 512" width="10" height="12" aria-hidden="true">
        <path fill="currentColor" d="M31 239 175 95c9-9 24-9 33 0s9 24 0 33L97 256l111 128c9 9 9 24 0 33s-24 9-33 0L31 273a24 24 0 0 1 0-34z" />
      </svg>
    </button>
    <button
      type="button"
      class="next"
      :disabled="!hasNext"
      :aria-label="`Next style of ${variants[shown].style}`"
      @click.stop="goTo(shown + 1)"
      @dblclick.stop
    >
      <svg viewBox="0 0 256 512" width="10" height="12" aria-hidden="true">
        <path fill="currentColor" d="M225 273 81 417c-9 9-24 9-33 0s-9-24 0-33l111-128L48 128c-9-9-9-24 0-33s24-9 33 0l144 144a24 24 0 0 1 0 34z" />
      </svg>
    </button>

    <ul
      class="pagination-control"
      :class="{
        'transition-left': transitionLeft,
        'transition-right': transitionRight,
        'do-slide': doSlide,
      }"
    >
      <li
        class="transition-blob"
        :class="{ transitioning: transitionLeft || transitionRight }"
        :style="{ '--source': shown - pips[0], '--target': target - pips[0] }"
      >
        <span v-for="part in 5" :key="part" class="transition-blob-part" />
      </li>
      <li class="transition-left" />
      <li v-for="pip in pips" :key="pip" :class="{ active: pip === shown }">
        <button
          type="button"
          :aria-label="variants[pip].style"
          :aria-current="pip === shown"
          @click.stop="goTo(pip)"
          @dblclick.stop
        />
      </li>
      <li class="transition-right" />
    </ul>
  </div>
</template>

<style lang="scss" scoped>
// Space Builder's catalog style carousel (forms/CatalogObjectThumbnailOverlay.vue and
// ui/custom/components/_catalog_subcategory_group_field.scss).
$duration: 250ms;
$easing: ease-out;
$pip: 1.125rem;

.overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;

  > * {
    position: absolute;
    z-index: 2;
    pointer-events: auto;
  }
}

.transition-img {
  display: flex;
  flex-direction: row;
  inset: 0;
  contain: paint;
  opacity: 0;
  pointer-events: none;
  transition: none;

  > img {
    flex: 0 0 100%;
    width: 100%;
    height: 100%;
    object-fit: contain;
    padding: 0.5rem;
  }

  &.transition-right {
    opacity: 1;

    > img {
      transition: translate $duration $easing;
      translate: -100%;
    }
  }

  &.transition-left {
    opacity: 1;
    flex-direction: row-reverse;

    > img {
      transition: translate $duration $easing;
      translate: 100%;
    }
  }
}

.group-object-count {
  top: 0.5rem;
  right: 0.5rem;
  display: flex;
  flex-direction: row;
  gap: 0.25rem;
  align-items: center;
  justify-content: center;
  padding: 0.25rem;
  border: 1px solid var(--active-count-color);
  border-radius: 0.75rem;
  background: color-mix(in srgb, var(--active-count-color), black 5%);
  color: #fff;
  font-size: 0.75rem;
  line-height: 1;

  .vr {
    width: 1px;
    height: 0.75em;
    background: color-mix(in srgb, currentColor 80%, black);
    rotate: 10deg;
  }
}

button.previous,
button.next {
  top: 50%;
  translate: 0 -50%;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75em;
  height: 1.75em;
  padding: 0;
  border: 0;
  border-radius: 0.25em;
  background: rgba(52, 58, 64, 0.4);
  color: #fff;
  cursor: pointer;

  &:not([disabled]):is(:hover, :focus-visible) {
    outline: 1px solid rgba(52, 58, 64, 0.75);
  }

  &[disabled] {
    color: rgba(173, 181, 189, 0.75);
    cursor: default;
  }
}

button.previous { left: 0.25rem; }
button.next { right: 0.25rem; }

ul.pagination-control {
  bottom: 0.25rem;
  left: 50%;
  display: flex;
  flex-direction: row;
  margin: 0;
  padding: 0;
  list-style: none;
  transform: translateX(-50%);
  translate: 0 0;

  > li {
    position: relative;
    width: $pip;
    height: $pip;
    opacity: 1;
    scale: 1;
    transform-origin: center;

    button {
      position: absolute;
      top: 50%;
      left: 50%;
      width: calc($pip / 2);
      height: calc($pip / 2);
      padding: 0;
      border: 2px solid var(--active-pip-color);
      border-radius: 100%;
      background: transparent;
      translate: -50% -50%;
      cursor: pointer;
    }
  }

  > li:is(.transition-left, .transition-right) {
    opacity: 0;
    scale: 0.5;
  }

  &:not(:is(.transition-left, .transition-right)) > li.active button {
    background: color-mix(in srgb, var(--active-pip-color), black 15%);
  }

  &.do-slide {
    &.transition-left {
      translate: $pip 0;
      transition: translate $duration $easing;

      > li.transition-left {
        transition: opacity $duration $easing, scale $duration ease-in;
        opacity: 1;
        scale: 1;
      }

      > li:nth-last-child(1 of li:not(.transition-right, .transition-blob)) {
        transition: opacity $duration $easing, scale $duration ease-in;
        opacity: 0;
        scale: 0.5;
      }
    }

    &.transition-right {
      translate: -$pip 0;
      transition: translate $duration $easing;

      > li.transition-right {
        transition: opacity $duration $easing, scale $duration ease-in;
        opacity: 1;
        scale: 1;
      }

      > li:nth-child(1 of li:not(.transition-left, .transition-blob)) {
        transition: opacity $duration $easing, scale $duration ease-in;
        opacity: 0;
        scale: 0.5;
      }
    }
  }
}

.transition-blob {
  position: absolute;
  top: calc(#{calc($pip / 4)} + 1px);
  left: calc((var(--source) + 1) * #{$pip} + #{calc($pip / 4)});
  width: calc($pip / 2);
  height: calc($pip / 2);
  pointer-events: none;
  translate: 0 0;
  transition: translate 0ms linear;

  &.transitioning {
    transition: translate $duration $easing;
    translate: calc((var(--target) - var(--source)) * #{$pip}) 0;

    @for $i from 1 through 5 {
      .transition-blob-part:nth-child(#{$i}) {
        position: absolute;
        inset: 0;
        border-radius: 100%;
        background: var(--active-pip-color);
        scale: calc(90% - 10% * #{$i - 1});
        opacity: calc(60% - 10% * #{$i - 1});
        translate: calc((var(--source) - var(--target)) * (#{calc($pip / 5)} * 0.75) * #{$i}) 0;
      }
    }
  }
}

@media (prefers-reduced-motion: reduce) {
  .transition-img,
  .transition-img > img,
  ul.pagination-control,
  ul.pagination-control > li,
  .transition-blob {
    transition-duration: 1ms !important;
  }
}
</style>
