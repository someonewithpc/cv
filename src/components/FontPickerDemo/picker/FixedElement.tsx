import { type Dispatch, type ReactNode, type SetStateAction, useEffect, useLayoutEffect, useRef, useState } from 'react';

type Pin = { top: number, left: number, width: number, height: number, fontSize: string };

/**
 * Keeps an element in the regular flow until the pointer reaches it, then pins it at the
 * same screen position so the page can reflow underneath: the picker rewrites the root
 * font size and family, which moves everything — including the control being dragged.
 *
 * The pin goes through the top layer rather than a plain `position: fixed`. The drawing
 * sheets are rotated, so a fixed box inside one is laid out against the sheet, not the
 * viewport, and lands somewhere else entirely.
 */
export function FixedElement(
  { children, isInteracting, setIsInteracting }:
  { children: ReactNode, isInteracting: boolean, setIsInteracting: Dispatch<SetStateAction<boolean>> }
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pinnedRef = useRef<HTMLDivElement | null>(null);
  const spacerRef = useRef<HTMLDivElement | null>(null);
  const [pinnedRect, setPinnedRect] = useState<Pin | null>(null);

  useEffect(() => {
    if (!containerRef.current || !spacerRef.current) return;

    const content = containerRef.current.firstElementChild!.firstElementChild! as HTMLElement;

    const resizeCallback = (contentRect: DOMRect | DOMRectReadOnly) => {
      spacerRef.current!.style.setProperty('width', contentRect.width + 'px');
      spacerRef.current!.style.setProperty('height', contentRect.height + 'px');
    };

    const resizeObserver = new ResizeObserver(([{ contentRect }]) => {
      requestAnimationFrame(() => resizeCallback(contentRect));
    });
    resizeObserver.observe(content);

    resizeCallback(content.getBoundingClientRect());

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Before paint: a `popover` element is display:none until shown, and React has just
  // set the attribute during commit
  useLayoutEffect(() => {
    if (pinnedRect) pinnedRef.current?.showPopover();
  }, [pinnedRect]);

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative' }}
      onMouseEnter={(e) => {
        const { top, left, width, height } = e.currentTarget.getBoundingClientRect();
        // Frozen in px: the panel is rem-sized, so it would grow under the pointer
        // while the size slider rescales the page
        const { fontSize } = getComputedStyle(e.currentTarget);
        setPinnedRect({ top, left, width, height, fontSize });
      }}
      onMouseLeave={() => {
        setPinnedRect(null);
        setIsInteracting(false);
      }}
    >
      <div
        ref={pinnedRef}
        popover={pinnedRect ? 'manual' : undefined}
        style={{
          // The top layer applies its own margin, border, padding and colours
          margin: 0,
          border: 0,
          padding: 0,
          overflow: 'visible',
          color: 'inherit',
          background: 'var(--font-picker-panel-bg)',
          position: pinnedRect ? 'fixed' : 'absolute',
          ...(pinnedRect ?? { inset: 0 }),
          ...(isInteracting && { boxShadow: '0 0 25px 25px var(--font-picker-panel-bg)' }),
        }}
      >
        <div>
          {children}
        </div>
      </div>
      <div ref={spacerRef} />
    </div>
  );
}
