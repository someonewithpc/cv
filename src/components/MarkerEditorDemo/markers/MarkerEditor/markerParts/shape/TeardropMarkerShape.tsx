import { clamp } from "../../../../lib/mapRange";
import { Point } from "../shared";
import type { PointLiteral } from "../shared";

import { MarkerShape } from './MarkerShape';

export class TeardropMarkerShape extends MarkerShape {
  get default () {
    return {
      center: new Point(0, -0.25),
      sectorStart: new Point(-0.5, 0),
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
        marker.constrainRadius(marker.state.center, marker.state.center, marker.state.sectorStart, 0.05, 1);
        marker.constrainSnap(marker.state.center);
      },

      get sectorStart(): Point {
        return marker.state.sectorStart;
      },
      set sectorStart(value: PointLiteral | Point) {
        // Constrain it to be on the left side of the vertical line down the middle, with a minimum distance of 0.05
        marker.constrainDistanceToLine(value, marker.state.sectorStart, { x: -1, y: 0 }, 0.05, Infinity);
        marker.constrainRadius(marker.state.sectorStart, marker.state.sectorStart, marker.state.center, 0.05, 1);
      },

      get sectorEnd(): Point {
        return new Point(-marker.state.sectorStart.x, marker.state.sectorStart.y);
      },
      set sectorEnd(value: PointLiteral | Point) {
        marker.controlPoints.sectorStart = new Point(-value.x, value.y);
      },

      get tip(): Point {
        return marker.state.tip;
      },
      set tip(value: PointLiteral | Point) {
        marker.constrainVertical(
          { x: value.x, y: clamp(value.y, Math.max(marker.state.center.y, marker.state.sectorStart.y), 1) },
          marker.state.tip,
        );
      },
    };
  }

  get center() { return this.controlPoints.center; }
  get sectorStart() { return this.controlPoints.sectorStart; }
  get tip() { return this.controlPoints.tip; }

  get radius() {
    return this.center.distanceTo(this.sectorStart);
  }

  get largeArcFlag() {
    return this.center.y < this.sectorStart.y;
  }

  get path() {
    return [
      `M ${this.sectorStart.x}, ${this.sectorStart.y}`,                                                                      // Move to the point where the sector starts
      `a ${this.radius}, ${this.radius}, 0 ${this.largeArcFlag ? 1 : 0} 1, ${2 * (this.center.x - this.sectorStart.x)}, 0`,  // Arc for sector
      `L ${this.tip.x}, ${this.tip.y}`,                                                                                      // Line to tip
      `L ${this.sectorStart.x}, ${this.sectorStart.y}`,                                                                      // Line back to sector start
      'z',                                                                                                                   // Close the path by drawing a line back to the starting point
    ].join(' ');
  }

  title = 'Teardrop';
}
