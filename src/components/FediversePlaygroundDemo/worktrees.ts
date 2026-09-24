// src/worktrees/manager.ts's decisions, with git's answers passed in instead of shelled out for.
// syncWorktrees walks the instances in config order, one bare mirror per software, and
// ensureWorktree picks a branch and one of four `git worktree add` forms for each.

import { listInstances, type PlaygroundConfig } from './config';

/** What the bare mirror knows: its local heads, and what origin has. */
export type MirrorRefs = { local: readonly string[]; remote: readonly string[] };

export type WorktreePlan = {
  instance: string;
  mirror: string;
  worktree: string;
  requested: string;
  checkout: string;
  /** Who already holds the requested branch, when that forced the rename. */
  collidesWith?: string;
  /** Which of ensureWorktree's four forms ran, 0 to 3, and the command it ran. */
  rung: number;
  command: string;
};

/** The four forms, in the order ensureWorktree tries them. */
export const RUNGS = [
  'local branch already exists',
  'branch off the local head',
  'branch off origin',
  'start a new branch',
] as const;

/** The command each rung runs, as ensureWorktree spells it. */
export function worktreeCommand(rung: number, { path, branch, checkout }: { path: string; branch: string; checkout: string }) {
  return [
    `git worktree add ${path} ${checkout}`,
    `git worktree add -b ${checkout} ${path} ${branch}`,
    `git worktree add -b ${checkout} ${path} origin/${branch}`,
    `git worktree add -b ${checkout} ${path}`,
  ][rung];
}

export function planWorktrees(config: PlaygroundConfig, refs: Record<string, MirrorRefs>): WorktreePlan[] {
  // Which instance holds which branch in each mirror, as `git worktree list` would say.
  const checkedOut = new Map<string, Map<string, string>>();

  return listInstances(config).map((instance) => {
    const mirror = `mirrors/${instance.software}`;
    const held = checkedOut.get(mirror) ?? new Map<string, string>();
    checkedOut.set(mirror, held);
    const { local, remote } = refs[instance.software] ?? { local: [], remote: [] };

    const branch = instance.branch || instance.source.ref;
    const collidesWith = held.get(branch);
    const checkout = collidesWith ? `${branch}-${instance.instance_id}` : branch;
    const path = instance.worktree;

    const rung = local.includes(checkout) ? 0 : local.includes(branch) ? 1 : remote.includes(branch) ? 2 : 3;
    const command = worktreeCommand(rung, { path, branch, checkout });

    held.set(checkout, instance.instance_id);
    return { instance: instance.instance_id, mirror, worktree: path, requested: branch, checkout, collidesWith, rung, command };
  });
}
