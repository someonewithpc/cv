import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';

type Pin = { top: number, left: number, width: number, height: number, fontSize: string };

/**
 * Holds its content at the same screen position while the pointer or focus is inside it.
 * The tools rewrite the root font size, which reflows the whole page, this sheet
 * included; without this the slider would run away from the pointer dragging it.
 *
 * The hold goes through the top layer rather than plain `position: fixed`: the drawing
 * sheets are rotated, so a fixed box inside one is laid out against the sheet, not the
 * viewport. The font size is frozen in px for the same reason the position is.
 */
export function Pinned({ children, className }: { children: ReactNode, className?: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [pin, setPin] = useState<Pin | null>(null);

  // Before paint: a popover is display:none until shown, and React has only just set
  // the attribute
  useLayoutEffect(() => {
    if (pin) boxRef.current?.showPopover();
  }, [pin]);

  // A page turned or scrolled out from under the pointer never sends a pointer-leave, and the
  // pinned box would stay floating over whatever came next. The paper stack turns a page by
  // renumbering its wrapper's --page-index (the front is 1) without moving it, so that is
  // watched directly; leaving the viewport covers the page scrolling away under the pointer
  useEffect(() => {
    if (!pin || !hostRef.current) return;
    const release = () => setPin(null);

    const page = hostRef.current.closest<HTMLElement>('[data-paper-stack-root] > *');
    const mutations = new MutationObserver(() => {
      if (page!.style.getPropertyValue('--page-index').trim() !== '1') release();
    });
    if (page) mutations.observe(page, { attributes: true, attributeFilter: ['style'] });

    const intersections = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => !entry.isIntersecting)) release();
      },
      { threshold: 0.5 },
    );
    intersections.observe(hostRef.current);

    return () => {
      mutations.disconnect();
      intersections.disconnect();
    };
  }, [pin]);

  const grab = () => {
    if (pin || !hostRef.current) return;
    const { top, left, width, height } = hostRef.current.getBoundingClientRect();
    setPin({ top, left, width, height, fontSize: getComputedStyle(hostRef.current).fontSize });
  };

  const release = () => setPin(null);

  return (
    <div
      ref={hostRef}
      className={className}
      style={pin ? { height: pin.height } : undefined}
      onPointerEnter={grab}
      onPointerLeave={release}
      onFocus={grab}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) release();
      }}
    >
      <div
        ref={boxRef}
        popover={pin ? 'manual' : undefined}
        style={pin ? {
          // The top layer brings its own margin, border, padding and colours
          position: 'fixed',
          inset: 'auto',
          margin: 0,
          border: 0,
          padding: 0,
          overflow: 'visible',
          color: 'inherit',
          background: 'none',
          ...pin,
        } : undefined}
      >
        {children}
      </div>
    </div>
  );
}
