import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowDownAZ } from "@fortawesome/free-solid-svg-icons";

import type { SpaceType } from '../../../../store';

import { LetterSpaceNumberMarkerDecoration } from "./LetterSpaceNumberMarkerDecoration";

export class UppercaseSpaceLetterMarkerDecoration extends LetterSpaceNumberMarkerDecoration {
  textContent(space: SpaceType): string {
    return super.textContent(space).toUpperCase();
  }

  Thumbnail() {
    return (
      <FontAwesomeIcon icon={faArrowDownAZ} />
    );
  }

  title = 'Upper case Space Letter';
}
