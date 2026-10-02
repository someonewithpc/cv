import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBan } from "@fortawesome/free-solid-svg-icons/faBan";

import { MarkerPart } from "../shared";

export class EmptyMarkerDecoration extends MarkerPart {
  Thumbnail() {
    return (
      <FontAwesomeIcon icon={faBan} />
    );
  }

  Content({ extraProps }: { extraProps: Record<string, string> }) {
    return <g className="marker-decoration" {...extraProps} />;
  }

  title = 'Empty';
}
