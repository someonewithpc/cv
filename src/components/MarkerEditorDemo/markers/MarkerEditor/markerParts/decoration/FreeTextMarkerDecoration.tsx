import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFont } from "@fortawesome/free-solid-svg-icons";

import type { SpaceType } from '@/store';

import { TextMarkerDecoration } from "./TextMarkerDecoration";
import { Point } from "../shared";
import type { PointLiteral } from "../shared";

export class FreeTextMarkerDecoration extends TextMarkerDecoration {
  get default() {
    return {
      ...super.default,
      textSizeCP: new Point(0.33333, 0), // TODO make text size uniform
      lineHeightCP: new Point(0, 0.5),
    };
  }

  get defaultReactiveState() {
    return {
      text: 'A' as string,
    };
  }

  buildControlPoints() {
    const marker = this;
    const baseControlPoints = super.buildControlPoints();
    const ownControlPoints = {
      get center(): Point {
        return baseControlPoints.center;
      },
      set center(value: PointLiteral | Point) {
        const start = { x: marker.state.center.x, y: marker.state.center.y };
        baseControlPoints.center = value;
        marker.state.lineHeightCP.x += marker.state.center.x - start.x;
        marker.state.lineHeightCP.y += marker.state.center.y - start.y;
      },

      get lineHeightCP(): Point {
        return marker.state.lineHeightCP;
      },
      set lineHeightCP(value: PointLiteral | Point) {
        marker.constrainRadius(value, marker.state.lineHeightCP, marker.state.center, 0.2, 1);
        marker.constrainVertical(marker.state.lineHeightCP, marker.state.lineHeightCP, marker.state.center);
      },
    };

    return this.mergeControlPointDescriptors(baseControlPoints, ownControlPoints);
  }

  get lineHeightCP() { return this.controlPoints.lineHeightCP; }

  get lineHeight() {
    return this.center.distanceTo(this.lineHeightCP);
  }

  textContentLength(): number {
    return Math.max(
      1,
      ...(this.reactiveState.text.split('\n').map((s) => s.length)),
    );
  }

  Content({ space, extraProps }: { space: SpaceType, extraProps: Record<string, string> }) {
    const lines = this.reactiveState.text.split('\n');
    return (
      <text
        x={this.center.x}
        y={this.center.y - this.lineHeight}
        dominantBaseline="middle"
        textAnchor="middle"
        fontSize={this.textSize(space)}
        lengthAdjust="spacingAndGlyphs"
        className="marker-decoration"
        {...extraProps}
      >
        {lines.map((line, index) => (
          <tspan
            key={index}
            x={this.center.x}
            dy={this.lineHeight}
          >
            {line}
          </tspan>
        ))}
      </text>
    );
  }

  Thumbnail() {
    return (
      <FontAwesomeIcon icon={faFont} />
    );
  }

  Configuration() {
    return (
      <>
        <label htmlFor="marker-free-text">Text</label>
        <textarea
          id="marker-free-text"
          key="free-text-marker-decoration-textarea"
          className="w-100"
          data-demo-target="editor:free-text"
          value={this.reactiveState.text}
          onChange={(e) => { this.reactiveState.text = e.target.value; }}
        />
      </>
    );
  }

  title = 'Free Text';
}
