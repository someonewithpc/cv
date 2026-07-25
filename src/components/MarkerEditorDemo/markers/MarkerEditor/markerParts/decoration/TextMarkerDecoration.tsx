import { clamp } from "lodash";

import $store, { spaceGlobalOrderSelector } from '@/store';
import type { SpaceType } from '@/store';

import { MarkerPart, Point } from "../shared";
import type { PointLiteral } from "../shared";

export class TextMarkerDecoration extends MarkerPart {
  get default() {
    return {
      center: new Point(0, 0),
      textSizeCP: new Point(0.5, 0),
    };
  }

  buildControlPoints() {
    const marker = this;
    return {
      get center(): Point {
        return marker.state.center;
      },
      set center(value: PointLiteral | Point) {
        const start = { x: marker.state.center.x, y: marker.state.center.y };
        marker.constrainVertical(value, marker.state.center);
        marker.constrainSnap(marker.state.center);
        marker.state.textSizeCP.x += marker.state.center.x - start.x;
        marker.state.textSizeCP.y += marker.state.center.y - start.y;
      },

      get textSizeCP(): Point {
        return marker.state.textSizeCP;
      },
      set textSizeCP(value: PointLiteral | Point) {
        marker.constrainRadius(value, marker.state.textSizeCP, marker.state.center, 0.2, 1);
      },
    };
  }

  get center() { return this.controlPoints.center; }
  get textSizeCP() { return this.controlPoints.textSizeCP; }

  get radius() {
    return this.center.distanceTo(this.textSizeCP);
  }

  // Unitless font-size is in SVG user units so text scales with the viewBox
  // (px would bake the editor's on-screen size and overflow on map pins).
  textSize(space: SpaceType): number {
    return clamp((this.radius * 2) / this.textContentLength(space), 0.1, 2);
  }

  Content({ space, extraProps }: { space: SpaceType, extraProps: Record<string, string> }) {
    return (
      <text
        x={this.center.x}
        y={this.center.y}
        dominantBaseline="middle"
        textAnchor="middle"
        fontSize={this.textSize(space)}
        className="marker-decoration"
        {...extraProps}
      >
        {this.textContent(space)}
      </text>
    );
  }

  spaceNumber(space: SpaceType) {
    return spaceGlobalOrderSelector($store.getState())[space.id] + 1;
  }

  textContent(_space: SpaceType): React.ReactNode {
    throw new Error('Derived class must override `textContent(space: SpaceType): ReactNode`');
  }

  textContentLength(space: SpaceType) {
    const text = this.textContent(space);
    if (typeof text === 'string') {
      return text.length;
    } else {
      throw new Error('Derived class must override `textContentLength(space: SpaceType): number`');
    }
  }
}
