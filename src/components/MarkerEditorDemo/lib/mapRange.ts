export function mapRange(value: number, fromMin: number, fromMax: number, toMin: number, toMax: number) {
  if (value <= fromMin) return toMin;
  if (value >= fromMax) return toMax;

  value -= fromMin;
  fromMax -= fromMin;

  return (value / fromMax) * (toMax - toMin) + toMin;
}
