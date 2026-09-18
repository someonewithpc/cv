import { type ReactNode, useEffect, useRef, useState } from 'react';
import cx from 'classnames';

import { watchFrontPage } from '@/client/frontPage';

type Pin = { top: number, left: number, width: number, height: number, fontSize: string };

/**
 * The product's FixedElement: a control that leaves the flow and holds its screen position
 * while the pointer or focus is on it, so the reflow its own change causes cannot carry it
 * away from the hand on it. While it is being worked (`interacting`) it also rises above its
 * neighbours with a halo of the sidebar's colour, the way the product's does.
 *
 * The drawing sheet is rotated, so `position: fixed` inside it resolves against the sheet
 * rather than the viewport; a probe finds that origin. The font size is frozen in px for the
 * same reason the position is.
 */
export function Pinned(
  { children, interacting, onLeave }:
  { children: ReactNode, interacting: boolean, onLeave: () => void }
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [pin, setPin] = useState<Pin | null>(null);

  // A page turned from under the pointer never sends a pointer-leave, and the pinned box would
  // stay floating over whatever came next. Nothing else may let go: a size drag reflows the
  // whole sheet and can carry the host clean out of view, and the pin is there precisely to
  // hold through that
  useEffect(() => {
    const host = hostRef.current;
    if (!pin || !host) return;
    return watchFrontPage(host, (front) => {
      if (!front) release();
    });
  }, [pin]); // eslint-disable-line react-hooks/exhaustive-deps

  const grab = () => {
    const host = hostRef.current;
    if (pin || !host) return;
    const { top, left, width, height } = host.getBoundingClientRect();
    const probe = document.createElement('div');
    probe.style.cssText = 'position: fixed; top: 0; left: 0; width: 0; height: 0; visibility: hidden';
    host.append(probe);
    const origin = probe.getBoundingClientRect();
    probe.remove();
    setPin({ top: top - origin.top, left: left - origin.left, width, height, fontSize: getComputedStyle(host).fontSize });
  };

  const release = () => {
    setPin(null);
    onLeave();
  };

  return (
    <div
      ref={hostRef}
      className={cx('pinned', { 'is-interacting': interacting })}
      style={pin ? { height: pin.height } : undefined}
      onPointerEnter={grab}
      onPointerLeave={release}
      onFocus={grab}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) release();
      }}
    >
      <div
        className={cx('pinned-box', { 'is-held': pin !== null })}
        style={pin ? { position: 'fixed', top: pin.top, left: pin.left, width: pin.width, fontSize: pin.fontSize } : undefined}
      >
        {children}
      </div>
    </div>
  );
}
