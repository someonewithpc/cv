// The picker's auto-play: a list of scenes run in a loop by a controller that can be paused
// and resumed between them. Everything a scene does goes through a Run bound to one token,
// so a pause mid-scene unwinds it at the next await instead of leaving a half-typed field.

export const CURSOR_TRAVEL_MS = 560; // Must match the cursor's CSS transition
const CLICK_MS = 180;
const TYPE_CHAR_MS = 130;

export type CursorState = { x: number; y: number; clicking: boolean; dragging: boolean };
export type CursorHook = (state: CursorState | null) => void;

export class Cancelled extends Error {}

export const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
export const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

const easeInOutQuad = (t: number) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);

// React installs its own value descriptor on inputs, so the prototype's setter is what makes
// the change visible to its onChange
export function setNativeValue(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

const center = (el: Element) => {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
};

// Where a range input paints its thumb for a value: the track is inset by the thumb's radius
const thumbPoint = (input: HTMLInputElement, value: number) => {
  const rect = input.getBoundingClientRect();
  const min = Number(input.min), max = Number(input.max);
  const t = max === min ? 0 : (value - min) / (max - min);
  return { x: rect.left + 8 + (rect.width - 16) * t, y: rect.top + rect.height / 2 };
};

export class Run {
  private last: { x: number; y: number } | null = null;

  constructor(private readonly controller: Playthrough, private readonly token: number) {}

  get cancelled() {
    return this.controller.token !== this.token;
  }

  check() {
    if (this.cancelled) throw new Cancelled();
  }

  async wait(ms: number) {
    await wait(ms);
    this.check();
  }

  private cursor(pos: { x: number; y: number }, flags: Partial<CursorState> = {}) {
    this.last = pos;
    this.controller.cursor({ x: pos.x, y: pos.y, clicking: false, dragging: false, ...flags });
  }

  async moveTo(el: Element) {
    this.check();
    const to = center(el);
    const moved = !this.last || Math.hypot(to.x - this.last.x, to.y - this.last.y) > 8;
    this.cursor(to);
    if (moved) await this.wait(CURSOR_TRAVEL_MS);
  }

  /** Move to an element and pulse the cursor there, without any DOM event */
  async press(el: Element) {
    await this.moveTo(el);
    this.cursor(center(el), { clicking: true });
    await this.wait(CLICK_MS);
    this.cursor(center(el));
  }

  async click(el: HTMLElement) {
    await this.press(el);
    el.click();
    await this.wait(400);
  }

  async choose(select: HTMLSelectElement, value: string) {
    await this.press(select);
    setNativeValue(select, value);
    await this.wait(500);
  }

  async type(input: HTMLInputElement, text: string) {
    await this.press(input);
    if (input.value !== '') {
      setNativeValue(input, '');
      await this.wait(300);
    }
    let built = '';
    for (const char of text) {
      built += char;
      setNativeValue(input, built);
      await this.wait(TYPE_CHAR_MS);
    }
  }

  async clear(input: HTMLInputElement) {
    if (input.value === '') return;
    setNativeValue(input, '');
    await this.wait(150);
  }

  /** Drag a range input through the given values, the cursor riding the thumb */
  async slide(input: HTMLInputElement, waypoints: number[], msPerLeg = 900) {
    if (input.disabled) return;
    const step = Number(input.step) || 1;
    let value = Number(input.value);
    this.cursor(thumbPoint(input, value));
    await this.wait(CURSOR_TRAVEL_MS);
    this.cursor(thumbPoint(input, value), { clicking: true });
    await this.wait(CLICK_MS);

    for (const target of waypoints) {
      const from = value;
      const start = performance.now();
      for (;;) {
        await nextFrame();
        this.check();
        const t = Math.min((performance.now() - start) / msPerLeg, 1);
        const raw = from + (target - from) * easeInOutQuad(t);
        const snapped = Math.round(raw / step) * step;
        if (snapped !== value) {
          value = snapped;
          setNativeValue(input, String(value));
        }
        // Re-read the thumb every frame: a size change reflows the page under the slider
        this.cursor(thumbPoint(input, raw), { dragging: true });
        if (t >= 1) break;
      }
      await this.wait(500);
      this.cursor(thumbPoint(input, value), { dragging: true });
    }
    this.cursor(thumbPoint(input, value));
  }

  /** Poll until the predicate holds, or give up after the timeout */
  async until(predicate: () => boolean, timeoutMs: number) {
    const start = performance.now();
    while (!predicate() && performance.now() - start < timeoutMs) await this.wait(100);
  }
}

export type Scene = (run: Run) => Promise<void>;

export class Playthrough {
  token = 0;
  running = false;
  private sceneIndex = 0;

  constructor(
    private readonly scenes: Scene[],
    readonly cursor: CursorHook,
    private readonly onLoop: () => void,
  ) {}

  start() {
    if (this.running) return;
    this.running = true;
    void this.loop(++this.token);
  }

  pause() {
    if (!this.running) return;
    this.running = false;
    this.token += 1;
    this.cursor(null);
  }

  private async loop(token: number) {
    while (this.token === token) {
      try {
        await this.scenes[this.sceneIndex](new Run(this, token));
      } catch (e) {
        if (e instanceof Cancelled) return;
        // A scene that lost its target should not wedge the loop
        console.debug('[FontPicker] scene failed', e);
      }
      if (this.token !== token) return;
      this.sceneIndex = (this.sceneIndex + 1) % this.scenes.length;
      if (this.sceneIndex === 0) this.onLoop();
    }
  }
}
