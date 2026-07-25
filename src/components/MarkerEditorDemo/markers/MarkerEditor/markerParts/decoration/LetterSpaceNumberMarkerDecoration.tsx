import type { SpaceType } from '@/store';

import { SpaceNumberMarkerDecoration } from "./SpaceNumberMarkerDecoration";

export class LetterSpaceNumberMarkerDecoration extends SpaceNumberMarkerDecoration {
  textContent(space: SpaceType): string {
    // spaceNumber is 1-based (lobby = 1); bijective base-26 expects that after n--.
    let remaining = this.spaceNumber(space);

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
}
