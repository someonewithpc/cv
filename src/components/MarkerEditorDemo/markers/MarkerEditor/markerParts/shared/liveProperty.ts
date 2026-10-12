/**
 * How long a dragged value has to hold still before React is told about it. Only the
 * thumbnail and the step list wait that long: the preview, the control and the serialized
 * marker are all current from the first event, and the control's own `change` flushes this
 * early.
 *
 * Under 100 ms the commits start landing inside the drag and the page stops keeping up:
 * 12.5 fps at 50 ms and 8.2 fps at 25 ms, against 28 fps here, on a 4x throttled drag.
 */
export const CONTROL_COMMIT_MS = 200;

/**
 * Keeps a picker event off React's root listener.
 *
 * React answers an input or change event on a field it rendered by writing the value back
 * onto the element, whatever its props say, and that attribute write invalidates far more
 * style than the colour does: 1917 ms of style recalculation over a two second drag against
 * 154 ms once React stops seeing the events. Nothing else listens for these; the handlers
 * read the colour off the element itself.
 */
export function keepReactOut(event: Event) {
  event.stopPropagation();
}


/**
 * A value a control drags, as the live preview reads it.
 *
 * In Safari 27 any edit to a stylesheet already in the document restyles the whole page,
 * a rule's `setProperty` as much as new text: about 310 ms a time on this page, so a colour
 * drag ran at 5 fps and every commit cost another 310 ms. The preview's rule reads the value
 * from a custom property on the preview's `<svg>` instead, and a drag writes only that
 * property: 1 ms. Its `<style>` keeps the same text through a drag and its commit. A saved
 * marker has no such `<svg>` around it, so its rule keeps the value itself.
 */
export class LiveProperty {
  constructor(
    private container: { readonly current: SVGElement | null },
    readonly name: string,
  ) {}

  /** What the rule says: the custom property in the preview, the value itself when saved. */
  css(value: string | number, live: boolean | undefined): string {
    return live ? `var(${this.name})` : String(value);
  }

  set(value: string | number) {
    this.container.current?.style.setProperty(this.name, String(value));
  }
}

/**
 * Where a part's rule applies. A pin on the map, or a thumbnail in the selector, can show
 * the marker being edited under the same id, and it has none of the preview's custom
 * properties to read, so in the preview the rules stop at the preview.
 */
export function markerScope(markerId: string | number | undefined, live: boolean | undefined): string {
  return live ? `:where(.marker-preview) > #marker-${markerId}` : `#marker-${markerId}`;
}
