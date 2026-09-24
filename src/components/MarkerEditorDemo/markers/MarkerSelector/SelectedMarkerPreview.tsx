import { useMemo } from 'react';

import { mapSpaceToMarkerSelector, useAppSelector, type SpaceType } from '@/store';

import { resolveMarkerSvgForSpace } from '../resolveMarkerSvgForSpace';

import { InlineSVG } from './InlineSVG';

/** Non-interactive map marker preview while the selector is open. */
export function SelectedMarkerPreview({
  space,
  position,
}: {
  space: SpaceType;
  position: { x: number; y: number };
}) {
  const mapSpaceToMarker = useAppSelector(mapSpaceToMarkerSelector);
  const marker = mapSpaceToMarker(space);
  const svg = useMemo(
    () => (marker.resolvedSource ? resolveMarkerSvgForSpace(marker.resolvedSource, space) : undefined),
    [marker.resolvedSource, space],
  );

  return (
    <div
      className="selected-marker-preview"
      style={{
        left: `${position.x}%`,
        top: `${position.y}%`,
        width: marker.size[0],
        height: marker.size[1],
        zIndex: 15,
        pointerEvents: 'none',
        colorScheme: 'only light',
      }}
      aria-hidden="true"
    >
      {svg
        ? <InlineSVG svgString={svg} />
        : <img src={marker.source} alt="" style={{ width: '100%', height: '100%', display: 'block' }} />}
    </div>
  );
}
