export function rotateRight<T>(array: T[], count: number) {
  return [
    ...array.slice(count, array.length),
    ...array.slice(0, count),
  ]
}
