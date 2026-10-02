import { clamp } from "../../../../lib/mapRange";
import { Point } from "../shared";
import type { PointLiteral } from "../shared";

import { MarkerShape } from './MarkerShape';

export class PinMarkerShape extends MarkerShape {
  get default () {
    return {
      center: new Point(0, -0.25),
      circumference: new Point(-0.5, 0),
      tip: new Point(0, 0.9),
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
        marker.constrainRadius(marker.state.center, marker.state.center, marker.state.circumference, 0.05, 1);
        marker.constrainSnap(marker.state.center);
      },

      get circumference(): Point {
        return marker.state.circumference;
      },
      set circumference(value: PointLiteral | Point) {
        marker.constrainRadius(value, marker.state.circumference, marker.state.center, 0.05, 1 - Math.abs(marker.state.center.y));
      },

      get tip(): Point {
        return marker.state.tip;
      },
      set tip(value: PointLiteral | Point) {
        marker.constrainVertical(
          { x: value.x, y: clamp(value.y, Math.max(marker.state.center.y, marker.state.circumference.y), 1) },
          marker.state.tip,
        );
      },
    };
  }

  get center() { return this.controlPoints.center; }
  get circumference() { return this.controlPoints.circumference; }
  get tip() { return this.controlPoints.tip; }

  get radius() {
    return this.center.distanceTo(this.circumference);
  }

  get largeArcFlag() {
    return this.center.y < this.circumference.y;
  }

  get path() {
    return [
      `M ${this.circumference.x}, ${this.circumference.y}`,                                                                    // Move to the point where the circumference starts
      `A ${this.radius}, ${this.radius}, 0 ${this.largeArcFlag ? 1 : 0} 1, ${-this.circumference.x}, ${this.circumference.y}`, // Arc for top of circumference
      `A ${this.radius}, ${this.radius}, 0 ${this.largeArcFlag ? 0 : 1} 1, ${this.circumference.x}, ${this.circumference.y}`,  // Arc for bottom of circumference
      `M ${this.center.x}, ${this.center.y + this.radius}`,                                                                    // Move to start of tip
      `L ${this.tip.x}, ${this.tip.y}`,                                                                                        // Line to tip
      'z',                                                                                                                     // Close the path by drawing a line back to the starting point
    ].join(' ');
  }

  title = 'Pin';
}
