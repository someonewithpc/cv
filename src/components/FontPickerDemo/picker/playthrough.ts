// The picker's auto-play: a list of scenes run in a loop by a controller that can be paused
// and resumed between them. Everything a scene does goes through a Run bound to one token,
// so a pause mid-scene unwinds it at the next await instead of leaving a half-typed field.

export const CURSOR_TRAVEL_MS = 560;
const CLICK_MS = 180;
const TYPE_CHAR_MS = 130;

export type CursorState = { x: number; y: number; clicking: boolean; dragging: boolean };
export type CursorHook = (state: CursorState | null) => void;

export class Cancelled extends Error {}

export const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
export const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

export const easeInOutQuad = (t: number) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);
const easeOutQuint = (t: number) => 1 - (1 - t) ** 5;

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
  constructor(private readonly controller: Playthrough, private readonly token: number) {}

  get cancelled() {
    return this.controller.token !== this.token;
  }

  check() {
    if (this.cancelled) throw new Cancelled();
  }

  // In short steps, re-reading what is under the cursor between them: the page changes under
  // a still cursor too, as when the drawn list closes
  async wait(ms: number) {
    const end = performance.now() + ms;
    for (;;) {
      await wait(Math.max(0, Math.min(100, end - performance.now())));
      this.check();
      this.controller.refresh();
      if (performance.now() >= end) return;
    }
  }

  /** Take the cursor off whatever it is over before that goes away, so leaves still fire */
  leave() {
    this.controller.hover(null);
  }

  private cursor(pos: { x: number; y: number }, flags: Partial<CursorState> = {}) {
    this.controller.place({ x: pos.x, y: pos.y, clicking: false, dragging: false, ...flags });
  }

  /** Show the cursor somewhere without travelling there */
  appear(at: { x: number; y: number }) {
    this.check();
    this.cursor(at);
  }

  async glide(to: { x: number; y: number }, ms = CURSOR_TRAVEL_MS, ease = easeOutQuint) {
    this.check();
    const from = this.controller.at;
    if (!from || Math.hypot(to.x - from.x, to.y - from.y) <= 8) {
      this.cursor(to);
      return;
    }
    const start = performance.now();
    for (;;) {
      await nextFrame();
      this.check();
      const t = Math.min((performance.now() - start) / ms, 1);
      const eased = ease(t);
      this.cursor({ x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased });
      if (t >= 1) return;
    }
  }

  async moveTo(el: Element) {
    await this.glide(center(el));
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

  async type(input: HTMLInputElement, text: string, charMs = TYPE_CHAR_MS) {
    await this.press(input);
    if (input.value !== '') {
      setNativeValue(input, '');
      await this.wait(300);
    }
    let built = '';
    for (const char of text) {
      built += char;
      setNativeValue(input, built);
      await this.wait(charMs);
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
    await this.moveTo(input);
    this.cursor(thumbPoint(input, value));
    await this.wait(CLICK_MS);
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

// The drawn cursor tells the page where it is the way a pointer would, so hover styles,
// pins and the drawn list answer to it. The events are untrusted, which is how the
// auto-play's own listeners tell them from a person's
const dispatchPointer = (type: string, target: Element | null, relatedTarget: Element | null) => {
  target?.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: 'mouse', relatedTarget }));
};

export class Playthrough {
  token = 0;
  running = false;
  at: { x: number; y: number } | null = null;
  private over: Element | null = null;
  private sceneIndex = 0;

  constructor(
    private readonly scenes: Scene[],
    private readonly cursor: CursorHook,
    private readonly onLoop: () => void,
    /** Brings the cursor in whenever it is not on the page: at the start, and after a hand-over */
    private readonly entrance?: Scene,
  ) {}

  start() {
    if (this.running) return;
    this.running = true;
    void this.loop(++this.token);
  }

  /** Stop, lifting the drawn cursor; `handoff` is what a real pointer is already over */
  pause(handoff: Element | null = null) {
    if (!this.running) return;
    this.running = false;
    this.token += 1;
    this.hover(handoff);
    this.at = null;
    this.cursor(null);
  }

  place(state: CursorState) {
    this.at = { x: state.x, y: state.y };
    this.cursor(state);
    this.refresh();
  }

  refresh() {
    if (this.at) this.hover(document.elementFromPoint(this.at.x, this.at.y));
  }

  hover(el: Element | null) {
    if (el === this.over) return;
    const from = this.over;
    this.over = el;
    dispatchPointer('pointerout', from, el);
    dispatchPointer('pointerover', el, from);
  }

  private async loop(token: number) {
    while (this.token === token) {
      try {
        if (this.at === null && this.entrance) await this.entrance(new Run(this, token));
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
