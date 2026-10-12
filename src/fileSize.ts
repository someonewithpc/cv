export function toKiB(text: string) {
  return `${Math.ceil((text.length / 1024) * 10) / 10}KiB`;
}
