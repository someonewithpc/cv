/** Bijective base 26 of a 1-based space number: 1 is a, 26 is z, 27 is aa. */
export function spaceLetters(number: number): string {
  let remaining = number;
  const digits: number[] = [];

  while (remaining > 0) {
    remaining -= 1;
    digits.push(remaining % 26);
    remaining = Math.floor(remaining / 26);
  }

  return digits
    .reverse()
    .map((digit) => String.fromCharCode('a'.charCodeAt(0) + digit))
    .join('');
}
