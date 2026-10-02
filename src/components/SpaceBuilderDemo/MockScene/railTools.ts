import { spaceBuilderAsset } from './assets';

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
  { id: 'view', title: 'View Mode [V]', icon: spaceBuilderAsset('tools/view.svg') },
  {
    id: 'add',
    title: 'Add [A]',
    icon: spaceBuilderAsset('tools/add.svg'),
    active: true,
    demoTarget: 'tool:add',
  },
  { id: 'select', title: 'Select [S]', icon: spaceBuilderAsset('tools/select.svg') },
  { id: 'unselect', title: 'Unselect all [ESC]', icon: spaceBuilderAsset('tools/unselect.svg') },
  { id: 'move', title: 'Move [M]', icon: spaceBuilderAsset('tools/move.svg') },
  { id: 'duplicate', title: 'Duplicate [D]', icon: spaceBuilderAsset('tools/duplicate.svg') },
  { id: 'rotate', title: 'Rotate [R]', icon: spaceBuilderAsset('tools/rotate.svg') },
  { id: 'replace', title: 'Replace [H]', icon: spaceBuilderAsset('tools/replace.svg') },
  { id: 'group', title: 'Group [G]', icon: spaceBuilderAsset('tools/group.svg') },
  { id: 'remove', title: 'Remove [DEL]', icon: spaceBuilderAsset('tools/remove.svg') },
];

export const RAIL_EDIT_TOOLS: RailTool[] = [
  { id: 'edit', title: 'Edit Selected [E]', icon: spaceBuilderAsset('tools/edit.svg') },
  { id: 'elevate', title: 'Set elevation', icon: spaceBuilderAsset('tools/elevate.svg') },
  { id: 'measure', title: 'Measure & Space Editor', icon: spaceBuilderAsset('tools/measure.svg') },
];

export const RAIL_ARRANGE_TOOLS: RailTool[] = [
  { id: 'align', title: 'Align', icon: spaceBuilderAsset('tools/align.svg') },
  { id: 'distribute', title: 'Align and distribute', icon: spaceBuilderAsset('tools/distribute.svg') },
];

export const RAIL_EXTRA_TOOLS: RailTool[] = [
  { id: 'text-draw', title: 'Text & Draw Tools', icon: spaceBuilderAsset('tools/text-draw.svg') },
  { id: 'guests', title: 'Guests & Table Numbers [I]', icon: spaceBuilderAsset('tools/guests.svg') },
  { id: 'debug', title: 'Debug', icon: spaceBuilderAsset('tools/debug.svg') },
];
