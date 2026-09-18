/**
 * How long a dragged value has to hold still before React is told about it. Only the
 * thumbnail and the step list wait that long: the preview, the control and the serialized
 * marker are all current from the first event, and the control's own `change` flushes this
 * early.
 */
export const CONTROL_COMMIT_MS = 250;

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
 * The CSS rule a marker part's `Content` rendered into the live preview.
 *
 * Re-rendering the `<style>` invalidates the style of every element on the page, and the
 * React commit that follows forces a layout: tens of milliseconds per event on a page
 * carrying three demos. Editing the parsed rule in place only touches what its selector
 * matches, which is what keeps a colour drag off React's render path.
 *
 * A re-render swaps the parsed rule out from under us, so the `<style>` element is what
 * gets cached, never the rule. `property` tells parts sharing a selector apart — the shape
 * fill and the shape border colour both write rules for `.marker-shape`.
 */
export class LiveStyleRule {
  private element: (HTMLStyleElement | SVGStyleElement) | null = null;

  constructor(
    private container: { readonly current: Element | null },
    private selectorSuffix: string,
    private property: string,
  ) {}

  private matches(element: HTMLStyleElement | SVGStyleElement): boolean {
    const rule = element.sheet?.cssRules[0];
    return rule instanceof CSSStyleRule
      && rule.selectorText.endsWith(this.selectorSuffix)
      && rule.style.getPropertyValue(this.property) !== '';
  }

  get(): CSSStyleRule | null {
    if (!this.element?.isConnected) {
      this.element = Array
        .from(this.container.current?.querySelectorAll('style') ?? [])
        .find((element) => this.matches(element)) ?? null;
    }

    const rule = this.element?.sheet?.cssRules[0];
    return rule instanceof CSSStyleRule ? rule : null;
  }
}
