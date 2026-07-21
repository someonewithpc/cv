import { Point } from "../shared";
import type { PointLiteral } from "../shared";

import { MarkerShape } from './MarkerShape';

export class CircleMarkerShape extends MarkerShape {
  get default () {
    return {
      center: new Point(0, 0),
      radiusPoint: new Point(0.6, 0),
    };
  }

  buildControlPoints() {
    const marker = this;
    return {
      get center(): Point {
        return marker.state.center;
      },
      set center(value: PointLiteral | Point) {
        marker.constrainVertical(value, marker.state.center);
        // TODO this isn't really corect
        marker.constrainRadius(marker.state.center, marker.state.center, marker.state.radiusPoint, 0.05, 1);
        marker.constrainSnap(marker.state.center);
      },

      get radiusPoint(): Point {
        return marker.state.radiusPoint;
      },
      set radiusPoint(value: PointLiteral | Point) {
        marker.constrainRadius(value, marker.state.radiusPoint, marker.state.center, 0.05, 1);
      },
    };
  }

  get center() { return this.controlPoints.center; }
  get radiusPoint() { return this.controlPoints.radiusPoint; }

  get radius() {
        return this.center.distanceTo(this.radiusPoint);
  }

  get path() {
    return [
      `M ${this.center.x + this.radius}, ${this.center.y}`,                                        // Move to the where the circle starts
      `A ${this.radius}, ${this.radius}, 0 1 1, ${this.center.x - this.radius}, ${this.center.y}`, // Arc for top of circle ending in left side
      `A ${this.radius}, ${this.radius}, 0 0 1, ${this.center.x + this.radius}, ${this.center.y}`, // Arc for bottom of circle going back to the start, with the other arc flag
      'z',                                                                                         // Close the path by drawing a line back to the starting point
    ].join(' ');
  }

  title = 'Circle';
}
