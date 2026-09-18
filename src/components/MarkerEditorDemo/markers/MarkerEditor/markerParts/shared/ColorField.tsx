import { mountInlineColorPicker } from "./inlineColorPicker";
import { markColorEvent } from "./perfReadout";

/**
 * The colour control both solid parts show: a native `<input type="color">` with the
 * on-page picker under it.
 *
 * The native input stays because it is the model everything else already talks to, the
 * walkthrough included, and because tapping it is still the way to reach the system palette
 * and the eyedropper. It is the picker under it that the drag happens on, so the preview
 * stays in sight while the colour moves. The input is rendered first so its ref, and with
 * it the value the picker reads, lands before the picker mounts.
 */
export function ColorField({ id, demoTarget, color, onInput, onChange }: {
  id: string,
  demoTarget: string,
  color: string,
  onInput: (event: Event) => void,
  onChange: (event: Event) => void,
}) {
  return (
    <>
      <label htmlFor={id}>Color</label>
      <div className="marker-color-field">
        <input
          id={id}
          type="color"
          data-demo-target={demoTarget}
          // No value, defaultValue or onChange. React answers an input event on a field it
          // owns by writing the value back onto the element, and that write restyles the
          // whole page: 1917 ms of style recalculation over a two second drag against
          // 154 ms for the same colours applied from a listener of our own. The value is
          // seeded here and on every render instead, which is also what keeps the open
          // picker's own selection from being pulled backwards mid drag.
          ref={(input) => {
            if (!input) return;
            input.value = color;
            input.addEventListener('input', onInput);
            input.addEventListener('input', markColorEvent);
            input.addEventListener('change', onChange);
          }}
        />
        <div
          className="marker-color-picker-host"
          ref={(host) => {
            const input = host?.previousElementSibling;
            if (host && input instanceof HTMLInputElement) mountInlineColorPicker(host, input);
          }}
        />
      </div>
    </>
  );
}
