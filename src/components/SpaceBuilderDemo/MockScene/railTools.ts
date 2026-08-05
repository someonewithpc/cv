export type RailTool = {
  id: string;
  title: string;
  icon: string;
  /** Active Add tool — only interactive control in the demo rail. */
  active?: boolean;
  demoTarget?: string;
};

/**
 * Left rail order mirrors Space Builder `BarSide` + nested `ContextMenu`
 * (icons from FA / `fac` custom set used in those tool components).
 */
export const RAIL_TOOLS: RailTool[] = [
  { id: 'view', title: 'View Mode [V]', icon: '/demos/space-builder/tools/view.svg' },
  {
    id: 'add',
    title: 'Add [A]',
    icon: '/demos/space-builder/tools/add.svg',
    active: true,
    demoTarget: 'tool:add',
  },
  { id: 'select', title: 'Select [S]', icon: '/demos/space-builder/tools/select.svg' },
  { id: 'unselect', title: 'Unselect all [ESC]', icon: '/demos/space-builder/tools/unselect.svg' },
  { id: 'move', title: 'Move [M]', icon: '/demos/space-builder/tools/move.svg' },
  { id: 'duplicate', title: 'Duplicate [D]', icon: '/demos/space-builder/tools/duplicate.svg' },
  { id: 'rotate', title: 'Rotate [R]', icon: '/demos/space-builder/tools/rotate.svg' },
  { id: 'replace', title: 'Replace [H]', icon: '/demos/space-builder/tools/replace.svg' },
  { id: 'group', title: 'Group [G]', icon: '/demos/space-builder/tools/group.svg' },
  { id: 'remove', title: 'Remove [DEL]', icon: '/demos/space-builder/tools/remove.svg' },
];

export const RAIL_EDIT_TOOLS: RailTool[] = [
  { id: 'edit', title: 'Edit Selected [E]', icon: '/demos/space-builder/tools/edit.svg' },
  { id: 'elevate', title: 'Set elevation', icon: '/demos/space-builder/tools/elevate.svg' },
  { id: 'measure', title: 'Measure & Space Editor', icon: '/demos/space-builder/tools/measure.svg' },
];

export const RAIL_ARRANGE_TOOLS: RailTool[] = [
  { id: 'align', title: 'Align', icon: '/demos/space-builder/tools/align.svg' },
  { id: 'distribute', title: 'Align and distribute', icon: '/demos/space-builder/tools/distribute.svg' },
];

export const RAIL_EXTRA_TOOLS: RailTool[] = [
  { id: 'text-draw', title: 'Text & Draw Tools', icon: '/demos/space-builder/tools/text-draw.svg' },
  { id: 'guests', title: 'Guests & Table Numbers [I]', icon: '/demos/space-builder/tools/guests.svg' },
  { id: 'debug', title: 'Debug', icon: '/demos/space-builder/tools/debug.svg' },
];
