/**
 * An on-page colour picker for the marker editor's fill and border colours.
 *
 * A native `<input type="color">` hands the drag to the browser, which draws its chooser
 * over the page: a modal dialog on Android Chrome, a system sheet on iOS. The preview being
 * edited is behind it, so on a phone nobody ever sees the colour follow the drag, however
 * cheap each step is made. The product answers this in the space builder with
 * `vanilla-picker` mounted into the page (`space-builder/.../forms/ColorPicker.vue`,
 * `popup: false`), which is the same answer in a library. This is that, small enough to
 * carry without a dependency and built straight into the DOM, so no drag frame goes
 * through React.
 *
 * The native input stays as the model. This writes to it and dispatches `input`, so the
 * walkthrough, the serialized marker and the live style rule all keep their one code path.
 *
 * The picker opens on a press of the swatch (the native input) and closes on the next press
 * of it, a press outside it, or Escape. A pointer's click on the swatch is cancelled so the
 * browser's own chooser stays put; the keyboard still reaches it, since Space and Enter
 * click without a press.
 */

type Hsv = { h: number, s: number, v: number };

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function hexToHsv(hex: string): Hsv {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const span = max - Math.min(r, g, b);

  let h = 0;
  if (span !== 0) {
    if (max === r) h = ((g - b) / span + 6) % 6;
    else if (max === g) h = (b - r) / span + 2;
    else h = (r - g) / span + 4;
  }

  return { h: h * 60, s: max === 0 ? 0 : span / max, v: max };
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const channel = (n: number) => {
    const k = (n + h / 60) % 6;
    const value = v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    return Math.round(value * 255).toString(16).padStart(2, '0');
  };

  return `#${channel(5)}${channel(3)}${channel(1)}`;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  parent: HTMLElement,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  parent.appendChild(node);
  return node;
}

/**
 * A rectangle the pointer drags inside. The box is read once per gesture: reading it per
 * move would force a layout back out of the style change the move just made, which is the
 * cost this whole path exists to avoid.
 *
 * A real pointer is tracked through pointer events with capture. The walkthrough presses
 * with mouse events only (see TechnicalDrawing/demo-cursor-press.ts), so its untrusted
 * mousedown, moves and mouseup drive the same tracking; a real pointer's own mouse events
 * are trusted and skipped, having been handled once already.
 */
function draggable(area: HTMLElement, onMove: (x: number, y: number) => void) {
  let box: DOMRect | null = null;

  const track = (event: MouseEvent) => {
    if (!box) return;
    event.preventDefault();
    onMove(clamp01((event.clientX - box.left) / box.width), clamp01((event.clientY - box.top) / box.height));
  };

  area.addEventListener('pointerdown', (event) => {
    box = area.getBoundingClientRect();
    area.setPointerCapture(event.pointerId);
    track(event);
  });
  area.addEventListener('pointermove', (event) => {
    if (area.hasPointerCapture(event.pointerId)) track(event);
  });
  area.addEventListener('pointerup', (event) => {
    box = null;
    area.releasePointerCapture(event.pointerId);
  });

  area.addEventListener('mousedown', (event) => {
    if (event.isTrusted) return;
    box = area.getBoundingClientRect();
    track(event);
  });
  area.addEventListener('mousemove', (event) => {
    if (!event.isTrusted) track(event);
  });
  area.addEventListener('mouseup', (event) => {
    if (!event.isTrusted) box = null;
  });
}

/** Shows the picker on a press of the swatch, and hides it again on the ways out. */
function openOnPress(field: HTMLElement, host: HTMLElement, input: HTMLInputElement) {
  host.hidden = true;

  // Escape is caught on the way down: the editor is a dialog and stops every keydown
  // it rendered from bubbling (see MarkerEditor/index.tsx), so a listener on the document
  // in the bubble phase never hears one pressed in the picker's own field.
  const close = () => {
    host.hidden = true;
    document.removeEventListener('mousedown', onPressOutside);
    document.removeEventListener('keydown', onEscape, true);
  };
  const onPressOutside = (event: MouseEvent) => {
    if (!field.contains(event.target as Node)) close();
  };
  // Stopped here, on the way down, so the Escape that closes the picker does not go on to
  // reach the editor's own Escape handler and close the editor with it.
  const onEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    close();
  };
  const open = () => {
    host.hidden = false;
    document.addEventListener('mousedown', onPressOutside);
    document.addEventListener('keydown', onEscape, true);
  };

  input.addEventListener('mousedown', () => {
    if (host.hidden) open();
    else close();
  });
  // A click that came from a press already toggled the picker; keep the browser's chooser
  // from opening over it. A keyboard click has no press behind it (`detail` is 0).
  input.addEventListener('click', (event) => {
    if (event.detail > 0) event.preventDefault();
  });
}

export function mountInlineColorPicker(host: HTMLElement, input: HTMLInputElement): void {
  if (host.dataset.picker === 'mounted') return;
  host.dataset.picker = 'mounted';

  openOnPress(host.parentElement ?? host, host, input);
  const root = element('div', 'marker-color-picker', host);
  const area = element('div', 'marker-color-picker__area', root);
  const areaKnob = element('div', 'marker-color-picker__knob', area);
  const hue = element('div', 'marker-color-picker__hue', root);
  const hueKnob = element('div', 'marker-color-picker__knob', hue);

  area.setAttribute('role', 'presentation');
  hue.setAttribute('role', 'presentation');
  area.dataset.demoTarget = `${input.dataset.demoTarget}:area`;

  let hsv = hexToHsv(input.value);

  const draw = () => {
    root.style.setProperty('--picker-hue', `${hsv.h}`);
    areaKnob.style.left = `${hsv.s * 100}%`;
    areaKnob.style.top = `${(1 - hsv.v) * 100}%`;
    hueKnob.style.left = `${(hsv.h / 360) * 100}%`;
    root.style.setProperty('--picker-color', input.value);
  };

  let emitting = false;
  const emit = () => {
    emitting = true;
    input.value = hsvToHex(hsv);
    draw();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    emitting = false;
  };

  draggable(area, (x, y) => { hsv = { ...hsv, s: x, v: 1 - y }; emit(); });
  draggable(hue, (x) => { hsv = { ...hsv, h: x * 360 }; emit(); });

  // The walkthrough and the native chooser both write the colour straight onto the input.
  // Our own events are skipped: black and grey have no hue or saturation to read back, so
  // a round trip through the hex would drop where the knobs are.
  input.addEventListener('input', () => {
    if (emitting) return;
    hsv = hexToHsv(input.value);
    draw();
  });

  draw();
}
