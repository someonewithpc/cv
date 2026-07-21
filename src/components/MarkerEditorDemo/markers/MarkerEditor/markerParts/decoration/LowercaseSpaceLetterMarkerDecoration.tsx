import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { faArrowDownAZLower } from '../../../../lib/fontAwesome';

import { LetterSpaceNumberMarkerDecoration } from "./LetterSpaceNumberMarkerDecoration";

export class LowercaseSpaceLetterMarkerDecoration extends LetterSpaceNumberMarkerDecoration {
  Thumbnail() {
    return (
      <FontAwesomeIcon icon={faArrowDownAZLower} />
    );
  }

  title = 'Lower case Space Letter';
}
