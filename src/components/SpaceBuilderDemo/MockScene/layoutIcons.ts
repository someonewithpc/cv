import type { LayoutStyle } from './scene/layoutEngine';

/**
 * Space Builder `fac` glyphs for seats/theater category layouts
 * (`LayoutsField.vue`: theater / theater_offset / t_herringbone / …).
 * Grid & Offset share `theater-grid` (flip-v); Chevron is `t-herringbone` (flip-v).
 */
export const LAYOUT_ICONS: Record<LayoutStyle, string> = {
  grid: '/demos/space-builder/layouts/grid.svg',
  offset: '/demos/space-builder/layouts/offset.svg',
  hollow: '/demos/space-builder/layouts/hollow.svg',
  chevron: '/demos/space-builder/layouts/chevron.svg',
  circle: '/demos/space-builder/layouts/circle.svg',
  semi_circle: '/demos/space-builder/layouts/semi_circle.svg',
  u_shape: '/demos/space-builder/layouts/u_shape.svg',
};
