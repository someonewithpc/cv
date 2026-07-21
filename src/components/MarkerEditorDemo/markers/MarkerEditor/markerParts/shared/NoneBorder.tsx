import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBan } from "@fortawesome/free-solid-svg-icons";

import type { SpaceType } from '@/store';

import { MarkerPart } from "./";

export class NoneBorder extends MarkerPart {
  protected get borderClassName(): string {
    return 'marker-border';
  }

  Content({ space, extraProps }: { space: SpaceType, extraProps: Record<string, string> }) {
    return (
      <style {...extraProps}>
        {`#marker-${space.markerId} .${this.borderClassName} {
          stroke: none;
        }`}
      </style>
    );
  }

  Thumbnail() {
    return (
      <FontAwesomeIcon icon={faBan} />
    );
  }

  title = 'None';
}

