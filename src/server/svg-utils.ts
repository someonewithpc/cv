import zip from 'lodash/zip';
import { rotateRight } from '@/server/array';

const PRECISION = 10000;

export interface Vertex {
  x: number,
  y: number,
}

function round(n: number): number {
  return Math.round(n * PRECISION) / PRECISION;
}

export function length(v0: Vertex, v1: Vertex): number {
  return Math.hypot(v0.x - v1.x, v0.y - v1.y);
}

export function subtract(v0: Vertex, v1: Vertex): Vertex {
  return { x: v1.x - v0.x, y: v1.y - v0.y };
}

export function crossProduct(v0: Vertex, v1: Vertex): number {
  return v0.x * v1.x + v0.y * v1.y;
}

export function alongLine(v0: Vertex, v1: Vertex, distance: number): Vertex {
  const l = length(v0, v1);

  return {
    x: round(v0.x + (v1.x - v0.x) / l * distance),
    y: round(v0.y + (v1.y - v0.y) / l * distance),
  };
}

export function medianAngle(v0, v1, p2): number {
  const a = subtract(v1, v0);
  const b = subtract(v1, p2);

  return Math.acos(crossProduct(a, b) / (length(v1, v0) * length(v1, p2))) / 2;
}

export function roundedCorners(vertices: Vertex[], radius: number): string {
  return zip(
    vertices,
    rotateRight(vertices, 1),
    rotateRight(vertices, 2),
  ).flatMap(([v0, v1, v2], index) => {
    const edge1Start = alongLine(v0, v1, radius);
    const edge1End = alongLine(v1, v0, radius);
    const edge2Start = alongLine(v1, v2, radius);
    const cornerRadius = round(Math.tan(medianAngle(v0, v1, v2)) * radius);

    return [
      index === 0 ? `M ${edge1Start.x}, ${edge1Start.y}` : '',

      `L ${edge1End.x}, ${edge1End.y}`,
      `A ${cornerRadius} ${cornerRadius} 0 0 0 ${edge2Start.x} ${edge2Start.y}`,

      index === vertices.length - 1 ? 'Z' : '',
    ];
  }).join(' ');
}
