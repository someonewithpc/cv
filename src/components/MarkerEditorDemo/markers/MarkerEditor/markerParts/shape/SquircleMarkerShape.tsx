import { Point } from "../shared";
import type { PointLiteral } from "../shared";

import { MarkerShape } from './MarkerShape';

export class SquircleMarkerShape extends MarkerShape {
  get default () {
    return {
      circumference: new Point(-0.5, 0),
      curvature: new Point(-0.5, -0.5),
    };
  }

  buildControlPoints() {
    const marker = this;
    return {
      get circumference(): Point {
        return marker.state.circumference;
      },
      set circumference(value: PointLiteral | Point) {
        marker.constrainHorizontal(value, marker.state.circumference);
        marker.constrainVertical(marker.state.curvature, marker.state.curvature, marker.state.circumference);
      },

      get curvature(): Point {
        return marker.state.curvature;
      },
      set curvature(value: PointLiteral | Point) {
        marker.constrainVertical(value, marker.state.curvature, marker.state.circumference);
      },
    };
  }

  get circumference() { return this.controlPoints.circumference; }
  get curvature() { return this.controlPoints.curvature; }

  get path() {
    return [
      // Move to the circumference control point (left), which will become the first point in the cubic bezier
      `M ${this.circumference.x}, ${this.circumference.y}`,
      // Make a curve from circumference cp (left) to the one mirrored along the tl-br diagonal, with the bezier control points defined similarly
      `C ${this.curvature.x}, ${this.curvature.y}  ${this.curvature.y}, ${this.curvature.x}  ${this.circumference.y}, ${this.circumference.x}`,
      // Starting from the last point, make another bezier controlled by the points such that the second curvature cp of the last curve becomes this
      // segment's first, mirrored horizontally, and the first becomes the second, again, mirrored horizontally
      `${-this.curvature.y}, ${this.curvature.x}  ${-this.curvature.x}, ${this.curvature.y}  ${-this.circumference.x}, ${this.circumference.y}`,
      // Ditto, but mirrored vertically
      `${-this.curvature.x}, ${-this.curvature.y}  ${-this.curvature.y}, ${-this.curvature.x}  ${this.circumference.y}, ${-this.circumference.x}`,
      // Once again, mirrored horizontally
      `${this.curvature.y}, ${-this.curvature.x}  ${this.curvature.x}, ${-this.curvature.y}  ${this.circumference.x}, ${this.circumference.y}`,
      // Close the path by drawing a line back to the starting point
      'z',
    ].join(' ');
  }

  title = 'Squircle';
}
