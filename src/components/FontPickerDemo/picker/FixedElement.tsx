import { type Dispatch, type ReactNode, type SetStateAction, useEffect, useRef, useState } from 'react';

const PANEL_BACKGROUND = '#e9e9e9'; // $sidebar-background

/**
 * A component that facilitates having an element both in the regular
 * document flow (`position: static`) while changing it to `position: fixed`
 * while it's being interacted with. This allows us to change styling that would
 * affect the position of this element without it moving away from where the user
 * is interacting, such as when changing the `font-size` or `font-family`
 */
export function FixedElement(
  { children, isInteracting, setIsInteracting, backgroundColor = PANEL_BACKGROUND }:
  { children: ReactNode, isInteracting: boolean, setIsInteracting: Dispatch<SetStateAction<boolean>>, backgroundColor?: string }
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const spacerRef = useRef<HTMLDivElement | null>(null);
  const [fixedPosition, setFixedPosition] = useState<{ top: number, left: number, right: number, bottom: number, width: number, height: number } | null>(null);

  useEffect(() => {
    if (!containerRef.current || !spacerRef.current) return;

    const container = containerRef.current;
    const contentWrapper = container.firstElementChild! as HTMLElement;
    const content = contentWrapper.firstElementChild! as HTMLElement;

    const resizeCallback = (contentRect: DOMRect | DOMRectReadOnly) => {
      spacerRef.current!.style.setProperty('width', contentRect.width + 'px');
      spacerRef.current!.style.setProperty('height', contentRect.height + 'px');
    };

    const resizeObserver = new ResizeObserver(([{ contentRect }]) => {
      if (content.style.getPropertyValue('position') === 'absolute') return;
      requestAnimationFrame(() => resizeCallback(contentRect));
    });
    resizeObserver.observe(content);

    resizeCallback(content.getBoundingClientRect());

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return (<>
    <div
      ref={containerRef}
      style={{ isolation: 'isolate', position: 'relative', zIndex: isInteracting ? 10 : '' }}
      onMouseEnter={(e) => {
        const { top, left, right, bottom, width, height } = e.currentTarget.getBoundingClientRect();
        setFixedPosition({ top, left, right, bottom, width, height });
      }}
      onMouseLeave={() => {
        setFixedPosition(null);
        setIsInteracting(false);
      }}
    >
      <div
        style={{
          zIndex: 1,
          position: fixedPosition ? 'fixed' : 'absolute',
          background: backgroundColor,
          ...(fixedPosition ?? { inset: 0 }),
          ...(isInteracting && { boxShadow: `0px 0px 25px 25px ${backgroundColor}` })
        }}
      >
        <div>
          {children}
        </div>
      </div>
      <div ref={spacerRef} />
    </div>
  </>);
}
