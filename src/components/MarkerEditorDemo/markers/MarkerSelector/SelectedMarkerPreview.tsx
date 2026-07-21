import { mapSpaceToMarkerSelector, useAppSelector, type SpaceType } from '@/store';

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

  return (
    <div
      className="selected-marker-preview"
      style={{
        position: 'absolute',
        left: `${position.x}%`,
        top: `${position.y}%`,
        translate: '-50% -100%',
        width: marker.size[0],
        height: marker.size[1],
        zIndex: 15,
        pointerEvents: 'none',
        colorScheme: 'only light',
      }}
      aria-hidden="true"
    >
      {marker.resolvedSource
        ? <InlineSVG svgString={marker.resolvedSource} />
        : <img src={marker.source} alt="" style={{ width: '100%', height: '100%', display: 'block' }} />}
    </div>
  );
}
