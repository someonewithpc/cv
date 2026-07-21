export function mapRange(value: number, fromMin: number, fromMax: number, toMin: number, toMax: number) {
  if (value <= fromMin) return toMin;
  if (value >= fromMax) return toMax;

  value -= fromMin;
  fromMax -= fromMin;

  return (value / fromMax) * (toMax - toMin) + toMin;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
