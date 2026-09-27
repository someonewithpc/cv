import type { PauseReason } from '@/client/frontPage';

import type { SpaceBuilderScene } from './SpaceBuilderScene';

/**
 * Only one Space Builder carousel page may own a WebGL context at a time.
 * Pausing the rAF loop is not enough — a live renderer still holds GPU memory,
 * and creating a second context on the next slide can crash the tab.
 */
let holder: SpaceBuilderScene | null = null;

/** Drop any current owner's GPU before constructing another SpaceBuilderScene. */
export function prepareSpaceBuilderGpu() {
  if (!holder) return;
  holder.releaseGpu();
  holder = null;
}

export function registerSpaceBuilderGpu(scene: SpaceBuilderScene) {
  prepareSpaceBuilderGpu();
  holder = scene;
}

export function claimSpaceBuilderGpu(scene: SpaceBuilderScene) {
  if (holder && holder !== scene) {
    holder.releaseGpu();
  }
  holder = scene;
  scene.attachGpu();
  scene.resume();
}

/**
 * A hidden tab or a window resize only pauses: the context is the page's own again when the
 * tab comes back or the size settles, and re-uploading the scene each time costs more than
 * the memory it frees.
 */
export function releaseSpaceBuilderGpu(scene: SpaceBuilderScene, reasons?: ReadonlySet<PauseReason>) {
  scene.pause();
  if (reasons && [...reasons].every((reason) => reason === 'hidden' || reason === 'resize')) return;
  scene.releaseGpu();
  if (holder === scene) holder = null;
}
