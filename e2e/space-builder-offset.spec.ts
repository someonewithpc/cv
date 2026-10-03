import { expect, test } from '@playwright/test';

import {
  CHAIR_FOOTPRINT,
  DEFAULT_LAYOUT_OPTIONS,
  layoutChairs,
  type AreaRect,
} from '../src/components/SpaceBuilderDemo/MockScene/scene/layoutEngine';

// The Offset layout follows the product's OffsetMixin: odd rows shift by the offset plus a
// re-anchor term (half a step when positive, the rows' length difference plus half a chair when
// negative), and the odd row's count uses |offset|. That keeps every chair inside the area on
// both sides (#220 C29) and makes the two directions differ the way the product's do.
const AREA: AreaRect = { x: 0, z: 0, width: 7.4, depth: 5.6, angle: 0 };
const EPS = 1e-6;
const SIZE_X = CHAIR_FOOTPRINT.width;
const STEP_X = SIZE_X + DEFAULT_LAYOUT_OPTIONS.distanceX;

function rowsAt(offset: number) {
  const { poses } = layoutChairs(AREA, { ...DEFAULT_LAYOUT_OPTIONS, style: 'offset', offset });
  const byZ = new Map<number, number[]>();
  for (const p of poses) {
    const z = Math.round(p.z * 1e6) / 1e6;
    byZ.set(z, [...(byZ.get(z) ?? []), p.x]);
  }
  const rows = [...byZ.entries()].sort(([a], [b]) => a - b).map(([, xs]) => xs.sort((a, b) => a - b));
  return { poses, rows };
}

for (const [offset, shift, oddCount] of [
  [-0.8, -0.8 + STEP_X + SIZE_X / 2, 10],
  [0, STEP_X / 2, 11],
  [0.8, 0.8 + STEP_X / 2, 10],
] as const) {
  test(`offset ${offset} shifts odd rows by the product's ${shift.toFixed(3)} and keeps every chair inside`, () => {
    const { poses, rows } = rowsAt(offset);
    expect(rows[0]).toHaveLength(12);
    expect(rows[1]).toHaveLength(oddCount);
    expect(rows[1][0] - rows[0][0]).toBeCloseTo(shift, 6);
    for (const p of poses) {
      expect(p.x - SIZE_X / 2).toBeGreaterThanOrEqual(-AREA.width / 2 - EPS);
      expect(p.x + SIZE_X / 2).toBeLessThanOrEqual(AREA.width / 2 + EPS);
    }
  });
}
