import { MarkerPart } from "../shared";

export class MarkerShape extends MarkerPart {
  Thumbnail() {
    const Content = this.Content.bind(this);
    return (
      <svg viewBox="-1 -1 2 2" xmlns="http://www.w3.org/2000/svg">
        <Content extraProps={{}} />
      </svg>
    );
  }

  Content({ extraProps }: { extraProps: Record<string, string> }) {
    return (
      <path d={this.path} className="marker-shape" {...extraProps} />
    );
  }
}
