import { useMemo } from 'react';

import { mapSpaceToMarkerSelector, useAppSelector, type SpaceType } from '../store';

import { InlineSVG } from '../markers/MarkerSelector/InlineSVG';
import { resolveMarkerSvgForSpace } from '../markers/resolveMarkerSvgForSpace';

export function SpacePin({
  space,
  interactive,
  onSelect,
}: {
  space: SpaceType;
  interactive: boolean;
  /** `byKeyboard`: the pin was pressed with keyboard focus on it, which the selector takes over. */
  onSelect: (space: SpaceType, byKeyboard: boolean) => void;
}) {
  const mapSpaceToMarker = useAppSelector(mapSpaceToMarkerSelector);
  const marker = mapSpaceToMarker(space);
  // Parsed and serialised once per marker and space, not on every cursor step that
  // re-renders the overlay.
  const svg = useMemo(
    () => (marker.resolvedSource ? resolveMarkerSvgForSpace(marker.resolvedSource, space) : undefined),
    [marker.resolvedSource, space],
  );

  return (
    <button
      type="button"
      className="space-pin"
      data-demo-target={`pin:${space.id}`}
      style={{
        left: `${space.x}%`,
        top: `${space.y}%`,
        width: marker.size[0],
        height: marker.size[1],
      }}
      aria-label={`Edit marker for ${space.name}`}
      onClick={(event) => {
        if (!interactive) return;
        onSelect(space, event.currentTarget.matches(':focus-visible'));
      }}
    >
      {svg
        ? <InlineSVG svgString={svg} />
        : <img src={marker.source} alt="" />}
    </button>
  );
}
