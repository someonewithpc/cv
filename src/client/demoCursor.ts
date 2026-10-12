/**
 * The drawn cursor a walkthrough moves, driven without the framework. The demo renders the
 * element and hands it over with `attach`; from then on a move, a press or a drag is a write on
 * that element, never a re-render. The position goes into `--cursor-x` and `--cursor-y`, which
 * the `demo-cursor` mixin (src/scss/_demo-cursor.scss) turns into `translate`, so a glide runs
 * as a compositor transition. A press and a drag set `data-clicking` and `data-dragging`.
 *
 * Positions are pixels inside the cursor's offset parent. The element can come and go (a
 * portal host changes, the cursor unmounts while gone): `attach` paints whatever the
 * controller last held onto the new element.
 */
import type { Point } from '@/client/cursorMotion';

export type DemoCursor = {
  /** Hand over the element, or null when it unmounts. Works as a React callback ref. */
  attach(el: HTMLElement | null): void;
  move(x: number, y: number): void;
  press(): void;
  release(): void;
  drag(on: boolean): void;
  /** Drop the press and the drag, as when a run stops mid-step. */
  reset(): void;
  readonly position: Point;
  readonly element: HTMLElement | null;
};

export function createDemoCursor(): DemoCursor {
  let el: HTMLElement | null = null;
  const at: Point = { x: 0, y: 0 };
  let clicking = false;
  let dragging = false;

  const paintPosition = () => {
    el?.style.setProperty('--cursor-x', `${at.x}px`);
    el?.style.setProperty('--cursor-y', `${at.y}px`);
  };
  const paintFlag = (name: string, on: boolean) => el?.toggleAttribute(name, on);

  const release = () => {
    clicking = false;
    paintFlag('data-clicking', false);
  };
  const drag = (on: boolean) => {
    dragging = on;
    paintFlag('data-dragging', on);
  };

  return {
    attach(next) {
      el = next;
      paintPosition();
      paintFlag('data-clicking', clicking);
      paintFlag('data-dragging', dragging);
    },
    move(x, y) {
      if (x === at.x && y === at.y) return;
      at.x = x;
      at.y = y;
      paintPosition();
    },
    press() {
      clicking = true;
      paintFlag('data-clicking', true);
    },
    release,
    drag,
    reset() {
      release();
      drag(false);
    },
    get position() {
      return { ...at };
    },
    get element() {
      return el;
    },
  };
}
