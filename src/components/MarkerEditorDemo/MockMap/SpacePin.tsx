import { mapSpaceToMarkerSelector, useAppSelector, type SpaceType } from '@/store';

import { InlineSVG } from '../markers/MarkerSelector/InlineSVG';

export function SpacePin({
  space,
  interactive,
  onSelect,
}: {
  space: SpaceType;
  interactive: boolean;
  onSelect: (space: SpaceType) => void;
}) {
  const mapSpaceToMarker = useAppSelector(mapSpaceToMarkerSelector);
  const marker = mapSpaceToMarker(space);

  return (
    <button
      type="button"
      className="space-pin"
      style={{
        left: `${space.x}%`,
        top: `${space.y}%`,
        width: marker.size[0],
        height: marker.size[1],
        pointerEvents: interactive ? 'auto' : 'none',
      }}
      aria-label={`Edit marker for ${space.name}`}
      onClick={() => {
        if (interactive) onSelect(space);
      }}
    >
      {marker.resolvedSource
        ? <InlineSVG svgString={marker.resolvedSource} />
        : <img src={marker.source} alt="" />}
    </button>
  );
}
