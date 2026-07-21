import { mapRange } from '../../../../lib/mapRange';

export type PointLiteral = { x: number, y: number };

export class Point {
  x: number;
  y: number;
  constructor(x: number | string, y?: number) {
    if (typeof x === 'string') {
      const [xVal, yVal] = x.split(';').map(Number);
      this.x = xVal;
      this.y = yVal;
    } else {
      this.x = x;
      this.y = y!;
    }
  }

  distanceTo(other: Point | PointLiteral) {
    return Math.hypot(this.x - other.x, this.y - other.y);
  }

  toCSSTranslate() {
    return `${mapRange(this.x, -1, 1, 0, 100)}% ${mapRange(this.y, -1, 1, 0, 100)}%`;
  }

  serialize() {
    return `${this.x.toFixed(3)};${this.y.toFixed(3)}`;
  }
}
