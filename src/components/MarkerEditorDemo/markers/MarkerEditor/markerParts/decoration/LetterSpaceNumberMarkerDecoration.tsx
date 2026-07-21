import type { SpaceType } from '@/store';

import { SpaceNumberMarkerDecoration } from "./SpaceNumberMarkerDecoration";

export class LetterSpaceNumberMarkerDecoration extends SpaceNumberMarkerDecoration {
  textContent(space: SpaceType): string {
    const num = this.spaceNumber(space);
    
    const digits: number[] = [];
    let remaining = num;

    while (remaining >= 0) {
      digits.push(remaining % 26);
      remaining = Math.floor(remaining / 26) - 1;
    }

    return digits
      .reverse()
      .map((digit) => String.fromCharCode('a'.charCodeAt(0) + digit))
      .join('');
  }
}
