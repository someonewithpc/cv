import { expect, test } from '@playwright/test';

import {
  CHAIR_FOOTPRINT,
  DEFAULT_LAYOUT_OPTIONS,
  layoutChairs,
  type AreaRect,
  type ChairPose,
  type LayoutStyle,
} from '../src/components/SpaceBuilderDemo/MockScene/scene/layoutEngine';

// The walkthrough's area (AutoPlayController buildSteps) and its hollow and U-shape spacings.
const AREA: AreaRect = { x: 0.1, z: 0.3, width: 6.6, depth: 5.4, angle: 0 };
const CASES: { style: LayoutStyle; distanceX: number; distanceZ: number; seats: number }[] = [
  // Space Builder infer/UShape: big = floor((6.6 + 0.22) / 0.641) = 10,
  // little = floor((5.4 - 0.499) / (0.421 + 0.35)) = 6, so 10 + 2 * 6.
  { style: 'u_shape', distanceX: 0.22, distanceZ: 0.35, seats: 22 },
  // infer/Hollow: big = 10, little = floor((5.4 - 2 * 0.499 - 0.4) / (0.421 + 0.4)) = 4.
  { style: 'hollow', distanceX: 0.25, distanceZ: 0.4, seats: 28 },
];

type Box = { minX: number; maxX: number; minZ: number; maxZ: number };
const EPS = 1e-6;

function footprint(p: ChairPose): Box {
  const quarter = Math.abs(Math.sin(p.angle)) > 0.5;
  const halfX = (quarter ? CHAIR_FOOTPRINT.depth : CHAIR_FOOTPRINT.width) / 2;
  const halfZ = (quarter ? CHAIR_FOOTPRINT.width : CHAIR_FOOTPRINT.depth) / 2;
  const x = p.x - AREA.x;
  const z = p.z - AREA.z;
  return { minX: x - halfX, maxX: x + halfX, minZ: z - halfZ, maxZ: z + halfZ };
}

/** The way a chair looks: chair.glb has its back at -Z, so yaw 0 faces +Z. */
function forward(p: ChairPose) {
  return { x: Math.round(Math.sin(p.angle)), z: Math.round(Math.cos(p.angle)) };
}

for (const { style, distanceX, distanceZ, seats } of CASES) {
  test.describe(`${style} layout`, () => {
    const { poses } = layoutChairs(AREA, { ...DEFAULT_LAYOUT_OPTIONS, style, distanceX, distanceZ });
    const byFacing = new Map<string, ChairPose[]>();
    for (const p of poses) {
      const f = forward(p);
      const key = `${f.x},${f.z}`;
      byFacing.set(key, [...(byFacing.get(key) ?? []), p]);
    }
    const top = byFacing.get('0,1') ?? [];
    const leftSide = byFacing.get('1,0') ?? [];
    const rightSide = byFacing.get('-1,0') ?? [];
    const bottom = byFacing.get('0,-1') ?? [];

    test('seat count matches Space Builder', () => {
      expect(poses).toHaveLength(seats);
      expect(bottom).toHaveLength(style === 'hollow' ? top.length : 0);
      expect(leftSide).toHaveLength(rightSide.length);
    });

    test('every chair faces the middle', () => {
      for (const p of poses) {
        const f = forward(p);
        expect(Math.abs(f.x) + Math.abs(f.z), `yaw ${p.angle} is square to the area`).toBe(1);
        const toMiddle = f.x * (AREA.x - p.x) + f.z * (AREA.z - p.z);
        expect(toMiddle, `chair at ${p.x.toFixed(2)},${p.z.toFixed(2)} looks away`).toBeGreaterThan(0);
      }
      // Each facing is one straight line across the direction it looks, not a row seen end on.
      for (const [key, line] of byFacing) {
        const [fx, fz] = key.split(',').map(Number);
        const along = line.map((p) => fx * p.x + fz * p.z);
        expect(Math.max(...along) - Math.min(...along), `${key} line`).toBeLessThan(EPS);
      }
    });

    test('side chairs step by their width and meet the top row without a gap', () => {
      const topBoxes = top.map(footprint);
      const topBack = Math.max(...topBoxes.map((b) => b.maxZ));
      const rowLeft = Math.min(...topBoxes.map((b) => b.minX));
      const rowRight = Math.max(...topBoxes.map((b) => b.maxX));

      for (const [side, flushX] of [[leftSide, rowLeft], [rightSide, rowRight]] as const) {
        const boxes = side.map(footprint).sort((a, b) => a.minZ - b.minZ);
        expect(boxes[0].minZ - topBack).toBeCloseTo(distanceZ, 6);
        for (let i = 1; i < boxes.length; i += 1) {
          expect(boxes[i].minZ - boxes[i - 1].minZ).toBeCloseTo(CHAIR_FOOTPRINT.width + distanceZ, 6);
        }
        const outer = side === leftSide ? boxes[0].minX : boxes[0].maxX;
        expect(outer).toBeCloseTo(flushX, 6);
        if (bottom.length) {
          const bottomFront = Math.min(...bottom.map((p) => footprint(p).minZ));
          expect(bottomFront - boxes[boxes.length - 1].maxZ).toBeCloseTo(distanceZ, 6);
        }
      }
    });

    test('chairs stay on the area and apart', () => {
      const boxes = poses.map(footprint);
      for (const b of boxes) {
        expect(b.minX).toBeGreaterThanOrEqual(-AREA.width / 2 - EPS);
        expect(b.maxX).toBeLessThanOrEqual(AREA.width / 2 + EPS);
        expect(b.minZ).toBeGreaterThanOrEqual(-AREA.depth / 2 - EPS);
        expect(b.maxZ).toBeLessThanOrEqual(AREA.depth / 2 + EPS);
      }
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i];
          const b = boxes[j];
          const overlap = a.minX < b.maxX - EPS && b.minX < a.maxX - EPS
            && a.minZ < b.maxZ - EPS && b.minZ < a.maxZ - EPS;
          expect(overlap, `chairs ${i} and ${j} overlap`).toBe(false);
        }
      }
    });
  });
}
