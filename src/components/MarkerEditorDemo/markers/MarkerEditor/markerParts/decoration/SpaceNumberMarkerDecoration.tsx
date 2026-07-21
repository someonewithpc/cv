import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowDown19 } from "@fortawesome/free-solid-svg-icons";

import $store, { spaceGlobalOrderSelector } from '@/store';
import type { SpaceType } from '@/store';

import { TextMarkerDecoration } from "./TextMarkerDecoration";

export class SpaceNumberMarkerDecoration extends TextMarkerDecoration {
  get defaultReactiveState() {
    return {
      spaceNumberOffset: 0,
    };
  }

  spaceNumber(space: SpaceType) {
    return spaceGlobalOrderSelector($store.getState())[space.id] + 1 + (this.reactiveState.spaceNumberOffset ?? 0);
  }

  textContent(space: SpaceType): string {
    return this.spaceNumber(space).toString();
  }

  Thumbnail() {
    return (
      <FontAwesomeIcon icon={faArrowDown19} />
    );
  }

  Configuration({ space: _ }: { space: SpaceType }) {
    return (
      <>
        <label htmlFor="marker-space-number-offset">Number Offset</label>
        <input
          id="marker-space-number-offset"
          type="number"
          value={this.reactiveState.spaceNumberOffset ?? 0}
          onChange={(e) => { this.reactiveState.spaceNumberOffset = parseInt(e.target.value, 10) || 0; }}
        />
      </>
    );
  }

  title = 'Space Number';
}
