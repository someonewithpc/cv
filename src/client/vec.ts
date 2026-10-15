export type Vec = { x: number; y: number };

export const rotateVec = (v: Vec, radians: number): Vec => {
  const c = Math.cos(radians), s = Math.sin(radians);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
};
