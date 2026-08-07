export type LayoutStyle =
  | 'grid'
  | 'offset'
  | 'hollow'
  | 'chevron'
  | 'circle'
  | 'semi_circle'
  | 'u_shape'
  | 'boardroom';

export const LAYOUT_STYLES: LayoutStyle[] = [
  'grid',
  'offset',
  'hollow',
  'chevron',
  'circle',
  'semi_circle',
  'u_shape',
  'boardroom',
];

export const LAYOUT_LABELS: Record<LayoutStyle, string> = {
  grid: 'Grid',
  offset: 'Offset',
  hollow: 'Hollow',
  chevron: 'Chevron',
  circle: 'Circle',
  semi_circle: 'Semi-Circle',
  u_shape: 'U-Shape',
  boardroom: 'Boardroom',
};

export type AreaRect = {
  /** Center X on the ground plane. */
  x: number;
  /** Center Z on the ground plane. */
  z: number;
  width: number;
  depth: number;
  /** Yaw in radians. */
  angle: number;
};

export type ChairPose = {
  x: number;
  z: number;
  angle: number;
};

export type BlocksOf = {
  /** Chairs per row in a block; 0 = fill. */
  width: number;
  /** Rows per block; 0 = fill. */
  height: number;
};

export type LayoutOptions = {
  style: LayoutStyle;
  /** Target seat count; 0 means fill the area. */
  seats: number;
  blocks: BlocksOf;
  /** Gap between chair footprints along X (main axis). */
  distanceX: number;
  /** Gap between chair footprints along Z (cross axis). */
  distanceZ: number;
  /** Gap between blocks / herringbone aisle. */
  aisle: number;
  /** Row stagger for offset layout. */
  offset: number;
  /** Herringbone/chevron yaw in radians. */
  angle: number;
  /** Empty diameter in the center of circle layouts. */
  innerDiameter: number;
};

export type UiFieldId =
  | 'seats'
  | 'blocks'
  | 'distanceX'
  | 'distanceZ'
  | 'aisle'
  | 'offset'
  | 'angle'
  | 'innerDiameter';

/** Scaled chair AABB from `chair.glb` (height normalized to 0.95m). */
export const CHAIR_FOOTPRINT = { width: 0.616, depth: 0.585 };

export const DEFAULT_LAYOUT_OPTIONS: LayoutOptions = {
  style: 'grid',
  seats: 0,
  blocks: { width: 0, height: 0 },
  distanceX: 0.2,
  distanceZ: 0.35,
  aisle: 0.8,
  offset: 0.3,
  angle: Math.PI / 8,
  innerDiameter: 0,
};

/** Which Options controls appear for the active layout — mirrors what each inferrer reads. */
export function uiFieldsForStyle(style: LayoutStyle): Set<UiFieldId> {
  switch (style) {
    case 'offset':
      // Staggered rows only — no block packing / aisle in layoutOffset.
      return new Set(['seats', 'distanceX', 'distanceZ', 'offset']);
    case 'hollow':
    case 'u_shape':
    case 'boardroom':
      return new Set(['seats', 'distanceX', 'distanceZ']);
    case 'chevron':
      return new Set(['seats', 'distanceX', 'distanceZ', 'aisle', 'angle']);
    case 'circle':
    case 'semi_circle':
      return new Set(['seats', 'distanceX', 'distanceZ', 'innerDiameter']);
    case 'grid':
    default:
      return new Set(['seats', 'blocks', 'distanceX', 'distanceZ', 'aisle']);
  }
}

/** True when the inferrer packs chairs into Blocks-of groups (Grid only). */
export function styleUsesBlocks(style: LayoutStyle) {
  return style === 'grid';
}

/** Aisle between blocks only applies once "Blocks of" has a size (not herringbone aisle). */
export function aisleNeedsBlocks(style: LayoutStyle) {
  return styleUsesBlocks(style);
}

export function isAisleEnabled(style: LayoutStyle, options: LayoutOptions) {
  if (!aisleNeedsBlocks(style)) return true;
  return options.blocks.width > 0 || options.blocks.height > 0;
}

/** Outer chair-ring radius used by Circle / Semi-Circle (mirrors Space Builder). */
export function circleUseableRadius(area: AreaRect, options: LayoutOptions) {
  const stepZ = CHAIR_FOOTPRINT.depth + options.distanceZ;
  const maxR = Math.min(area.width, area.depth) / 2;
  return Math.max(0, maxR - stepZ / 2);
}

/**
 * Meaningful Inner Circle slider max for the current area — maps the full
 * control travel onto “full fill → hollow → empty” instead of a dead 0–2m zone.
 */
export function maxInnerDiameter(area: AreaRect, options: LayoutOptions) {
  const useable = circleUseableRadius(area, options);
  if (useable <= 0) return 0.5;
  // Slightly past 2×useable so the top of the slider can clear the outer ring.
  return Number((useable * 2 + 0.05).toFixed(2));
}

export function layoutChairs(area: AreaRect, options: LayoutOptions): {
  poses: ChairPose[];
  seats: number;
  valid: boolean;
  maxSeats: number;
} {
  const candidates = buildCandidates(area, options);
  const maxSeats = candidates.length;
  const target = options.seats > 0 ? options.seats : maxSeats;
  const poses = candidates.slice(0, Math.min(target, maxSeats));
  const seats = poses.length;
  const valid = seats > 0 && (options.seats <= 0 || options.seats <= maxSeats);

  return { poses, seats, valid, maxSeats };
}

export function tagContent(seats: number, options?: LayoutOptions): string {
  if (seats <= 0) return '';
  let text = `${seats} ${seats === 1 ? 'seat' : 'seats'}`;
  if (!options || !styleUsesBlocks(options.style)) return text;
  const w = options.blocks.width;
  const h = options.blocks.height;
  // Leftover Blocks-of from a prior Grid pass must not leak onto Offset/etc.
  if (w > 0 && h > 0 && (w > 1 || h > 1)) {
    text += ` in blocks of ${w} by ${h}`;
  }
  return text;
}

/**
 * Space Builder Grid.inferArrangement: floor(size / (obj+gap)), then try one more
 * object that fits without a trailing gap.
 */
function countFit(size: number, obj: number, gap: number) {
  if (size < obj || obj <= 0) return 0;
  const stride = obj + gap;
  let n = Math.floor(size / stride);
  if (size - n * stride >= obj - 1e-9) n += 1;
  return Math.max(0, n);
}

function countBlocks(size: number, blockSize: number, aisle: number) {
  if (size < blockSize || blockSize <= 0) return 0;
  const stride = blockSize + aisle;
  let n = Math.floor(size / stride);
  if (size - n * stride >= blockSize - 1e-9) n += 1;
  return Math.max(0, n);
}

function occupiedSpan(count: number, obj: number, gap: number) {
  if (count <= 0) return 0;
  return count * obj + (count - 1) * gap;
}

function buildCandidates(area: AreaRect, options: LayoutOptions): ChairPose[] {
  switch (options.style) {
    case 'offset':
      return layoutOffset(area, options);
    case 'hollow':
      return layoutHollow(area, options);
    case 'chevron':
      return layoutChevron(area, options);
    case 'circle':
      return layoutCircle(area, options, Math.PI * 2);
    case 'semi_circle':
      return layoutCircle(area, options, Math.PI);
    case 'u_shape':
      return layoutUShape(area, options);
    case 'boardroom':
      return layoutBoardroom(area, options);
    case 'grid':
    default:
      return layoutGrid(area, options);
  }
}

function makePusher(area: AreaRect) {
  const cos = Math.cos(area.angle);
  const sin = Math.sin(area.angle);
  const poses: ChairPose[] = [];

  const pushLocal = (lx: number, lz: number, yaw = 0) => {
    // Same Y-rotation as Three.js / selectGroup (and localToWorld in SpaceBuilderScene).
    poses.push({
      x: area.x + lx * cos + lz * sin,
      z: area.z - lx * sin + lz * cos,
      angle: area.angle + yaw,
    });
  };

  return { poses, pushLocal };
}

function layoutGrid(area: AreaRect, options: LayoutOptions): ChairPose[] {
  const sizeX = CHAIR_FOOTPRINT.width;
  const sizeZ = CHAIR_FOOTPRINT.depth;
  const stepX = sizeX + options.distanceX;
  const stepZ = sizeZ + options.distanceZ;
  const { poses, pushLocal } = makePusher(area);

  // Space Builder SelectArea.fill from the rotated min corner, not the center.
  const originX = -area.width / 2 + sizeX / 2;
  const originZ = -area.depth / 2 + sizeZ / 2;

  const blockW = options.blocks.width > 0 ? options.blocks.width : 0;
  const blockH = options.blocks.height > 0 ? options.blocks.height : 0;

  if (blockW > 0 || blockH > 0) {
    const bw = blockW > 0 ? blockW : Math.max(1, countFit(area.width, sizeX, options.distanceX));
    const bh = blockH > 0 ? blockH : Math.max(1, countFit(area.depth, sizeZ, options.distanceZ));
    const blockSizeX = occupiedSpan(bw, sizeX, options.distanceX);
    const blockSizeZ = occupiedSpan(bh, sizeZ, options.distanceZ);
    const numBlocksX = countBlocks(area.width, blockSizeX, options.aisle);
    const numBlocksZ = countBlocks(area.depth, blockSizeZ, options.aisle);
    if (numBlocksX < 1 || numBlocksZ < 1) return poses;

    const strideX = blockSizeX + options.aisle;
    const strideZ = blockSizeZ + options.aisle;

    for (let bz = 0; bz < numBlocksZ; bz += 1) {
      for (let bx = 0; bx < numBlocksX; bx += 1) {
        const ox = originX + bx * strideX;
        const oz = originZ + bz * strideZ;
        for (let r = 0; r < bh; r += 1) {
          for (let c = 0; c < bw; c += 1) {
            pushLocal(ox + c * stepX, oz + r * stepZ);
          }
        }
      }
    }
    return poses;
  }

  const cols = countFit(area.width, sizeX, options.distanceX);
  const rows = countFit(area.depth, sizeZ, options.distanceZ);

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      pushLocal(originX + c * stepX, originZ + r * stepZ);
    }
  }
  return poses;
}

function layoutOffset(area: AreaRect, options: LayoutOptions): ChairPose[] {
  const sizeX = CHAIR_FOOTPRINT.width;
  const sizeZ = CHAIR_FOOTPRINT.depth;
  const stepX = sizeX + options.distanceX;
  const stepZ = sizeZ + options.distanceZ;
  const cols = countFit(area.width, sizeX, options.distanceX);
  const rows = countFit(area.depth, sizeZ, options.distanceZ);
  const { poses, pushLocal } = makePusher(area);
  const originX = -area.width / 2 + sizeX / 2;
  const originZ = -area.depth / 2 + sizeZ / 2;
  const stagger = options.offset;

  for (let r = 0; r < rows; r += 1) {
    const rowOffset = r % 2 === 0 ? 0 : stagger;
    const maxC = r % 2 === 0
      ? cols
      : countFit(Math.max(0, area.width - Math.abs(stagger)), sizeX, options.distanceX);
    for (let c = 0; c < maxC; c += 1) {
      pushLocal(originX + c * stepX + rowOffset, originZ + r * stepZ);
    }
  }
  return poses;
}

function layoutHollow(area: AreaRect, options: LayoutOptions): ChairPose[] {
  const sizeX = CHAIR_FOOTPRINT.width;
  const sizeZ = CHAIR_FOOTPRINT.depth;
  const stepX = sizeX + options.distanceX;
  const stepZ = sizeZ + options.distanceZ;
  const cols = countFit(area.width, sizeX, options.distanceX);
  const rows = countFit(area.depth, sizeZ, options.distanceZ);
  const { poses, pushLocal } = makePusher(area);
  const originX = -area.width / 2 + sizeX / 2;
  const originZ = -area.depth / 2 + sizeZ / 2;

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const edge = r === 0 || r === rows - 1 || c === 0 || c === cols - 1;
      if (edge) pushLocal(originX + c * stepX, originZ + r * stepZ);
    }
  }
  return poses;
}

/**
 * Theater herringbone (UI label "Chevron").
 * Port of HerringboneMixin infer + arrange: two aisle-split blocks, then pivot-rotate
 * each side. The ported column-count estimate (dividing by cos(angle)) can overshoot
 * near integer thresholds, so the fitted column count is verified against the actual
 * rotated footprint and backed off until every chair clears the area's X bounds.
 */
function layoutChevron(area: AreaRect, options: LayoutOptions): ChairPose[] {
  const angle = Math.min(Math.PI / 4, Math.max(0, options.angle));
  const sizeX = CHAIR_FOOTPRINT.width;
  const sizeZ = CHAIR_FOOTPRINT.depth;
  const { distanceX, distanceZ, aisle } = options;

  if (area.width <= aisle + sizeX || angle >= Math.PI / 2 - 1e-3) return [];

  const cosA = Math.max(1e-6, Math.cos(angle));
  const sinA = Math.sin(angle);

  // Z growth of one chair after rotating (HerringboneMixin.inferArrangement).
  const offsetZ = sizeZ / cosA - sizeZ;
  const stepX = sizeX + distanceX;
  const stepZ = sizeZ + distanceZ + offsetZ;

  const freeSizeX = (area.width - aisle) / 2 + distanceX;
  const rotatedFreeSizeX = ((area.width - aisle) / cosA) / 2 + distanceX;

  type Pt = { x: number; z: number };

  /** Rotate chair centers around the side's "top" corner (HerringboneMixin.arrangeObjects). */
  const rotateSide = (points: Pt[], yaw: number, pivotOffsetX: number) => {
    if (points.length === 0) return;
    let sumX = 0;
    let sumZ = 0;
    for (const p of points) {
      sumX += p.x;
      sumZ += p.z;
    }
    const cx = sumX / points.length;
    const cz = sumZ / points.length;
    // Pivot is local to the group centroid — matches objectGrouping.group + yRotateObjectAroundPoint.
    const pivotX = cx + pivotOffsetX;
    const pivotZ = cz + sizeZ / 2;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    for (const p of points) {
      const dx = p.x - pivotX;
      const dz = p.z - pivotZ;
      p.x = pivotX + c * dx + s * dz;
      p.z = pivotZ - s * dx + c * dz;
    }
  };

  const originX = -area.width / 2 + sizeX / 2;
  const originZ = -area.depth / 2 + sizeZ / 2;

  /** Un-rotated chair centers for one row, split into the two herringbone sides. */
  const buildSides = (cols: number, rowSizeX: number, offsetX: number, z: number) => {
    const left: Pt[] = [];
    const right: Pt[] = [];
    // Blocks.arrange with blocks.width = colsPerSide, arrangement.big = 2.
    for (let i = 0; i < cols; i += 1) {
      left.push({ x: originX + i * stepX - offsetX, z });
      const col = cols + i;
      const aisleOffsetX = aisle - distanceX;
      right.push({ x: originX + col * stepX + aisleOffsetX - offsetX, z });
    }
    rotateSide(left, angle, rowSizeX / 2);
    rotateSide(right, -angle, -rowSizeX / 2);
    return { left, right };
  };

  const halfWidth = area.width / 2;
  const cornerXs = (cx: number, yaw: number) => {
    const hw = sizeX / 2;
    const hd = sizeZ / 2;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    return [-hw, hw].flatMap((lx) => [-hd, hd].map((lz) => cx + lx * c - lz * s));
  };
  const sideFits = (points: Pt[], yaw: number) =>
    points.every((p) => cornerXs(p.x, yaw).every((x) => Math.abs(x) <= halfWidth + 1e-9));

  // Estimate colsPerSide, then back off until the rotated chair footprints actually
  // clear the area's X bounds (the /cosA estimate above can overshoot by one column).
  let colsPerSide = Math.max(0, Math.floor(rotatedFreeSizeX / stepX));
  let rowSizeX = 0;
  let offsetX = 0;
  for (;;) {
    if (colsPerSide < 1) return [];
    rowSizeX = stepX * colsPerSide - distanceX;
    offsetX = rowSizeX - freeSizeX + distanceX;
    const { left, right } = buildSides(colsPerSide, rowSizeX, offsetX, 0);
    if (sideFits(left, angle) && sideFits(right, -angle)) break;
    colsPerSide -= 1;
  }

  const rowOffsetZ = sizeZ * cosA + rowSizeX * sinA - sizeZ;
  const rows = Math.max(
    0,
    Math.floor((area.depth - rowOffsetZ + distanceZ) / stepZ),
  );
  if (rows < 1) return [];

  const { poses, pushLocal } = makePusher(area);

  for (let row = 0; row < rows; row += 1) {
    const z = originZ + row * stepZ;
    const { left, right } = buildSides(colsPerSide, rowSizeX, offsetX, z);
    for (const p of left) pushLocal(p.x, p.z, angle);
    for (const p of right) pushLocal(p.x, p.z, -angle);
  }

  return poses;
}

function layoutCircle(area: AreaRect, options: LayoutOptions, arc: number): ChairPose[] {
  const stepX = CHAIR_FOOTPRINT.width + options.distanceX;
  const stepZ = CHAIR_FOOTPRINT.depth + options.distanceZ;
  const useableRadius = circleUseableRadius(area, options);
  const { poses, pushLocal } = makePusher(area);
  // Full circle starts at +X; semi-circle opens toward −Z (top of the SelectArea).
  const startAngle = arc < Math.PI * 2 - 0.01 ? -Math.PI / 2 - arc / 2 : 0;

  if (useableRadius <= 0) return poses;

  // Space Builder: ceil((useableRadius - sizeZ) / stepZ).
  const rings = Math.max(
    0,
    Math.ceil((useableRadius - CHAIR_FOOTPRINT.depth) / stepZ),
  );
  const innerR = Math.max(0, options.innerDiameter / 2);

  for (let i = 0; i < rings; i += 1) {
    const r = useableRadius - i * stepZ;
    if (r < innerR || r <= 0) break;
    // Space Builder: ceil((circumference - sizeX) / stepX).
    const circumference = arc * r;
    const n = Math.max(0, Math.ceil((circumference - CHAIR_FOOTPRINT.width) / stepX));
    if (n === 0) break;
    for (let k = 0; k < n; k += 1) {
      const theta = startAngle + k * (arc / n);
      const lx = Math.cos(theta) * r;
      const lz = Math.sin(theta) * r;
      pushLocal(lx, lz, theta + Math.PI / 2);
    }
  }
  return poses;
}

function layoutUShape(area: AreaRect, options: LayoutOptions): ChairPose[] {
  const sizeX = CHAIR_FOOTPRINT.width;
  const sizeZ = CHAIR_FOOTPRINT.depth;
  const stepX = sizeX + options.distanceX;
  const stepZ = sizeZ + options.distanceZ;
  const { poses, pushLocal } = makePusher(area);

  const cols = countFit(area.width, sizeX, options.distanceX);
  const sideRows = countFit(Math.max(0, area.depth - sizeZ), sizeZ, options.distanceZ);
  const originX = -area.width / 2 + sizeX / 2;
  const topZ = -area.depth / 2 + sizeZ / 2;
  const sideStartZ = topZ + stepZ;

  for (let c = 0; c < cols; c += 1) {
    pushLocal(originX + c * stepX, topZ, Math.PI);
  }
  for (let r = 0; r < sideRows; r += 1) {
    const lz = sideStartZ + r * stepZ;
    pushLocal(-area.width / 2 + sizeX / 2, lz, Math.PI / 2);
    pushLocal(area.width / 2 - sizeX / 2, lz, -Math.PI / 2);
  }
  return poses;
}

/**
 * Two facing rows down the area's length (Space Builder Boardroom.arrangeObjects) —
 * chairs turned 90° so their footprint axes swap: width spans the row-to-row
 * stride, depth spans the center gap between the two facing rows.
 */
function layoutBoardroom(area: AreaRect, options: LayoutOptions): ChairPose[] {
  const alongLength = CHAIR_FOOTPRINT.width;
  const acrossGap = CHAIR_FOOTPRINT.depth;
  const { distanceX, distanceZ } = options;

  const requiredWidth = 2 * acrossGap + distanceX;
  if (area.width < requiredWidth) return [];

  const rows = countFit(area.depth, alongLength, distanceZ);
  if (rows < 1) return [];

  const { poses, pushLocal } = makePusher(area);
  const originZ = -area.depth / 2 + alongLength / 2;
  const stepZ = alongLength + distanceZ;
  const colOffset = acrossGap / 2 + distanceX / 2;

  for (let r = 0; r < rows; r += 1) {
    const z = originZ + r * stepZ;
    pushLocal(-colOffset, z, Math.PI / 2);
    pushLocal(colOffset, z, -Math.PI / 2);
  }
  return poses;
}
