import type { Locator } from '@playwright/test';

/**
 * A point on the folded-back corner itself, to grab with a real pointer drag. The flap's box
 * runs past the sheet edge, so its centre can fall in the cut-away corner and a press there
 * lands on the page under it. The resting crease runs from (w-x, h) to (w, h-y) and the
 * corner is mirrored across it, so the flap is that triangle; its centroid is inside it on any
 * sheet.
 */
export const flapGrip = (stack: Locator) => stack.locator('.paper-front').evaluate((sheet) => {
  const fold = sheet.querySelector<HTMLElement>('.paper-fold')!;
  const style = getComputedStyle(fold);
  const x = parseFloat(style.getPropertyValue('--fold-x'));
  const y = parseFloat(style.getPropertyValue('--fold-y'));
  const { right, bottom } = sheet.getBoundingClientRect();
  const mirrored = { x: right - (2 * x * y * y) / (x * x + y * y), y: bottom - (2 * x * x * y) / (x * x + y * y) };
  return {
    x: (right - x + right + mirrored.x) / 3,
    y: (bottom + bottom - y + mirrored.y) / 3,
  };
});
