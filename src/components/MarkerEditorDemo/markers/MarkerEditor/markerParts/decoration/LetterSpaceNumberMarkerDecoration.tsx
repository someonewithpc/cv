import type { SpaceType } from '../../../../store';

import { spaceLetters } from '../shared/spaceLetters';
import { SpaceNumberMarkerDecoration } from "./SpaceNumberMarkerDecoration";

export class LetterSpaceNumberMarkerDecoration extends SpaceNumberMarkerDecoration {
  textContent(space: SpaceType): string {
    return spaceLetters(this.spaceNumber(space));
  }
}
