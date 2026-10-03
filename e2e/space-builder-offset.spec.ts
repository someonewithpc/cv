import { expect, test } from '@playwright/test';

import {
  CHAIR_FOOTPRINT,
  DEFAULT_LAYOUT_OPTIONS,
  layoutChairs,
  type AreaRect,
} from '../src/components/SpaceBuilderDemo/MockScene/scene/layoutEngine';

// Regression for #220 C29: a negative Offset shifts every odd row left by the full Offset, as
// the product does, but left the row's first chairs outside the area. Chairs whose footprint
// leaves the area are removed; the rest keep their shifted positions.
const AREA: AreaRect = { x: 0, z: 0, width: 4, depth: 2, angle: 0 };
const EPS = 1e-6;
const STEP_X = CHAIR_FOOTPRINT.width + DEFAULT_LAYOUT_OPTIONS.distanceX;

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

test('a negative offset removes the chairs that leave the area and keeps the rest in place', () => {
  const { poses, rows } = rowsAt(-0.8);
  const halfX = AREA.width / 2;
  const halfZ = AREA.depth / 2;
  const footHalfX = CHAIR_FOOTPRINT.width / 2;
  const footHalfZ = CHAIR_FOOTPRINT.depth / 2;

  expect(rows.length).toBeGreaterThan(1);
  for (const p of poses) {
    expect(p.x - footHalfX).toBeGreaterThanOrEqual(-halfX - EPS);
    expect(p.x + footHalfX).toBeLessThanOrEqual(halfX + EPS);
    expect(p.z - footHalfZ).toBeGreaterThanOrEqual(-halfZ - EPS);
    expect(p.z + footHalfZ).toBeLessThanOrEqual(halfZ + EPS);
  }

  const even = rows[0];
  const odd = rows[1];
  expect(odd.length).toBeLessThan(even.length);
  // The odd row sits on the even row's grid shifted by the full 0.8 to the left, not clamped.
  for (const x of odd) {
    const steps = (x + 0.8 - even[0]) / STEP_X;
    expect(Math.abs(steps - Math.round(steps))).toBeLessThan(EPS);
  }
  expect(odd[0]).toBeGreaterThan(even[0]);
  expect(odd[odd.length - 1]).toBeLessThan(even[even.length - 1]);
});

test('a positive offset keeps its rows as before', () => {
  const { rows } = rowsAt(0.8);
  const even = rows[0];
  const odd = rows[1];
  expect(odd).toHaveLength(5);
  expect(even).toHaveLength(6);
  expect(odd[0]).toBeCloseTo(even[0] + 0.8, 6);
});
