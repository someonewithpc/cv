import { spaceBuilderAsset } from './assets';
import type { LayoutStyle } from './scene/layoutEngine';

/**
 * Space Builder `fac` glyphs for seats/theater category layouts
 * (`LayoutsField.vue`: theater / theater_offset / t_herringbone / …).
 * Grid is `theater-grid`; Offset is the same crescents with every other row shifted half a step.
 * Chevron is `t-herringbone` (flip-v).
 */
export const LAYOUT_ICONS: Record<LayoutStyle, string> = {
  grid: spaceBuilderAsset('layouts/grid.svg'),
  offset: spaceBuilderAsset('layouts/offset.svg'),
  hollow: spaceBuilderAsset('layouts/hollow.svg'),
  chevron: spaceBuilderAsset('layouts/chevron.svg'),
  circle: spaceBuilderAsset('layouts/circle.svg'),
  semi_circle: spaceBuilderAsset('layouts/semi_circle.svg'),
  u_shape: spaceBuilderAsset('layouts/u_shape.svg'),
  boardroom: spaceBuilderAsset('layouts/boardroom.svg'),
};
