import { type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowsRotate } from '@fortawesome/free-solid-svg-icons';

import { watchPageActive } from '@/client/frontPage';

import { CURSOR_GONE, DrawnCursor, type DrawnCursorState } from './DrawnCursor';
import { Pinned } from './Pinned';
import { Playthrough, type Run, setNativeValue } from './playthrough';

import './EditStyle.scss';
import './HeldControls.scss';

const RESUME_DELAY_MS = 2500;
const CURSOR_FADE_MS = 320;
const DRAG_STEP_MS = 190;
const DRAG_TO = 1.75;
const DRAG_TO_PORTRAIT = 1.5;

type Side = 'plain' | 'held';

/**
 * The product's settings column, once as it stands and once with FixedElement under the row
 * being worked. Everything but that is the same markup, the same rules and the same sizes,
 * so the only difference on the sheet is the one the component makes.
 */
function Column({ side }: { side: Side }) {
  const [size, setSize] = useState(1);
  const [interacting, setInteracting] = useState(false);

  const hold = (children: ReactNode) => (
    side === 'held'
      ? <Pinned interacting={interacting} onLeave={() => setInteracting(false)}>{children}</Pinned>
      : <div className="unheld">{children}</div>
  );

  return (
    <div className="column" data-side={side}>
      <p className="column-title">{side === 'held' ? 'With FixedElement' : 'Without FixedElement'}</p>

      <aside className="sidebar">
        <nav style={{ fontSize: `${size}em` }}>
          <section className="edit-settings">
            <ul>
              <li className="style font-settings">
                {hold(
                  <label>
                    <span>
                      <span>Font Size</span>
                      <FontAwesomeIcon icon={faArrowsRotate} title="Reset to default" style={{ float: 'right' }} />
                    </span>
                    <input
                      type="range"
                      data-demo-target={`size-${side}`}
                      min="0.5"
                      max="2.0"
                      step={1 / 8}
                      value={size}
                      onChange={(e) => {
                        setInteracting(true);
                        setSize(+e.currentTarget.value);
                      }}
                      onFocus={() => setInteracting(true)}
                      onBlur={() => setInteracting(false)}
                    />
                  </label>,
                )}

                <div className="unheld">
                  <label>
                    <span>
                      <span>Font Weight</span>
                      <FontAwesomeIcon icon={faArrowsRotate} title="Reset to default" style={{ float: 'right' }} />
                    </span>
                    <input type="range" data-demo-target={`weight-${side}`} min="100" max="1000" step={100} defaultValue={400} readOnly />
                  </label>
                </div>

                <div className="unheld">
                  <label>
                    <span>Font Family</span>
                    <select data-demo-target={`family-${side}`} defaultValue="poppins">
                      <option value="poppins">Poppins 400</option>
                    </select>
                  </label>
                </div>
              </li>
            </ul>
          </section>
        </nav>
      </aside>

      <p className="column-caption">
        {side === 'held'
          ? 'The row goes position: fixed where it stood, a spacer keeping its room, so the slider stays under the pointer'
          : 'Font Size grows with its own value and everything under it moves down, so the slider leaves the pointer mid-drag'}
      </p>
    </div>
  );
}

/** Drags each column's size slider in turn, with the pointer held where a hand would hold it. */
function Walkthrough({ root }: { root: React.RefObject<HTMLDivElement | null> }) {
  const [cursor, setCursor] = useState<DrawnCursorState>(CURSOR_GONE);
  const [grab, setGrab] = useState<{ top: number; left: number; width: number; thumb: number; side: Side } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const el = root.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // The carousel page: positioned, so a cursor drawn into it rides along with the page
    const page = el.closest<HTMLElement>('article.technical-drawing-stack > * > section') ?? el;
    setHost(page);

    const slider = (side: Side) => el.querySelector<HTMLInputElement>(`[data-demo-target="size-${side}"]`);

    // Where the thumb sits for a value: the track is inset by the thumb's radius
    const thumb = (input: HTMLInputElement) => {
      const rect = input.getBoundingClientRect();
      const t = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min));
      return { x: rect.left + 8 + (rect.width - 16) * t, y: rect.top + rect.height / 2 };
    };

    // A hand holds still while the layout moves under it, which is the whole point of the
    // comparison: the cursor stays at the point it grabbed, and only the value changes
    const dragHolding = async (run: Run, side: Side) => {
      const input = slider(side);
      if (!input) return;
      const at = thumb(input);
      await run.glide(at);
      await run.wait(500);

      // The line the drag started on, left on the sheet while it runs, and a dimension from it
      // to where the slider is now: the plain column walks away from it, the held one does not
      const column = input.closest<HTMLElement>('.column')!;
      const mark = () => {
        const sheet = page.getBoundingClientRect();
        const box = column.getBoundingClientRect();
        setGrab({
          top: at.y - sheet.top,
          left: box.left - sheet.left,
          width: box.width,
          thumb: thumb(input).y - sheet.top,
          side,
        });
      };
      mark();

      const stack = page.closest<HTMLElement>('article.technical-drawing-stack');
      const to = stack?.dataset.sheetOrientation === 'portrait' ? DRAG_TO_PORTRAIT : DRAG_TO;
      for (let value = 1 + 1 / 8; value <= to + 0.001; value += 1 / 8) {
        setNativeValue(input, value.toFixed(3));
        await run.wait(DRAG_STEP_MS);
        mark();
      }
      await run.wait(1800);
      setGrab(null);
      setNativeValue(input, '1');
      await run.wait(900);
    };

    let fadeTimer = 0;
    const controller = new Playthrough(
      [
        async (run) => { await dragHolding(run, 'plain'); },
        async (run) => { await dragHolding(run, 'held'); },
      ],
      (state) => {
        if (state === null) {
          setCursor((prev) => (prev.phase === 'gone' ? prev : { ...prev, phase: 'fading' }));
          fadeTimer = window.setTimeout(() => setCursor(CURSOR_GONE), CURSOR_FADE_MS);
          return;
        }
        window.clearTimeout(fadeTimer);
        const rect = page.getBoundingClientRect();
        setCursor({ ...state, x: state.x - rect.left, y: state.y - rect.top, phase: 'demo' });
      },
      () => {},
      async (run) => {
        const sheet = page.getBoundingClientRect();
        run.appear({ x: sheet.left + sheet.width * 0.2, y: sheet.bottom + 80 });
        await run.wait(300);
      },
    );

    let active = false;
    let userControl = false;
    let resumeTimer = 0;

    const play = () => {
      if (!active || userControl || controller.running) return;
      controller.start();
      setNotice(null);
    };

    const yieldToUser = (handoff: Element | null) => {
      window.clearTimeout(resumeTimer);
      if (controller.running) {
        controller.pause(handoff);
        setGrab(null);
        setNotice('Demo paused');
      }
      resumeTimer = window.setTimeout(play, RESUME_DELAY_MS);
    };

    // Every page of the stack shares one grid cell, so intersection alone would keep this
    // running behind whichever page the visitor turned to
    const stopPageWatch = watchPageActive(el, (next) => {
      active = next;
      if (next) play();
      else {
        window.clearTimeout(resumeTimer);
        controller.pause();
        setGrab(null);
      }
    });

    // Only a real pointer, and only over the sheet: the scripted values never come through
    // pointer events
    const onPointer = (e: PointerEvent) => {
      if (e.isTrusted && active) yieldToUser(e.target instanceof Element ? e.target : null);
    };
    page.addEventListener('pointermove', onPointer, { passive: true });
    page.addEventListener('pointerdown', onPointer, { passive: true });

    const onFocusIn = (e: FocusEvent) => {
      if (!e.isTrusted || controller.scriptedFocus) return;
      window.clearTimeout(resumeTimer);
      userControl = true;
      controller.pause();
      setGrab(null);
      setNotice('Demo paused');
    };
    const onFocusOut = (e: FocusEvent) => {
      if (!e.isTrusted || controller.scriptedFocus) return;
      if (e.relatedTarget instanceof Node && el.contains(e.relatedTarget)) return;
      userControl = false;
      resumeTimer = window.setTimeout(play, RESUME_DELAY_MS);
    };
    el.addEventListener('focusin', onFocusIn);
    el.addEventListener('focusout', onFocusOut);

    return () => {
      stopPageWatch();
      page.removeEventListener('pointermove', onPointer);
      page.removeEventListener('pointerdown', onPointer);
      el.removeEventListener('focusin', onFocusIn);
      el.removeEventListener('focusout', onFocusOut);
      window.clearTimeout(resumeTimer);
      window.clearTimeout(fadeTimer);
      controller.pause();
    };
  }, [root]);

  if (!host) return null;

  return createPortal(
    <>
      {grab && (
        <>
          <div className="grab-line" style={{ top: grab.top, left: grab.left, width: grab.width }} aria-hidden="true" />
          <div
            className="grab-measure"
            data-side={grab.side}
            style={{
              top: Math.min(grab.top, grab.thumb),
              // On the column's outer side, where the sheet has room for the figure
              left: grab.side === 'plain' ? grab.left - 12 : grab.left + grab.width + 12,
              height: Math.abs(grab.thumb - grab.top),
            }}
            aria-hidden="true"
          >
            <span>{Math.round(Math.abs(grab.thumb - grab.top))}px</span>
          </div>
        </>
      )}
      <DrawnCursor cursor={cursor} />
      <div className="font-picker-toasts" aria-live="polite">
        {notice && <div className="font-picker-toast">{notice}</div>}
      </div>
    </>,
    host,
  );
}

export default function HeldControlsApp() {
  const rootRef = useRef<HTMLDivElement>(null);

  return (
    <div className="held-controls" ref={rootRef} role="group" aria-label="Held controls, side by side">
      <Column side="plain" />
      <Column side="held" />
      <Walkthrough root={rootRef} />
    </div>
  );
}
