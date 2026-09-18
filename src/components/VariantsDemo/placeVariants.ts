import type { CatalogItem, CatalogVariant } from '@/components/SpaceBuilderDemo/MockScene/catalogItems';
import type { SpaceBuilderScene } from '@/components/SpaceBuilderDemo/MockScene/scene/SpaceBuilderScene';

export type Spot = { x: number; z: number };
export type Pick = { item: CatalogItem; variant: CatalogVariant; spot: Spot };

/**
 * Place one variant at a fixed spot on the floor.
 *
 * The scene places an object where its ghost stands, and the ghost is aimed in client
 * coordinates, so the spot makes the round trip through the camera. Returns false while the
 * GLB is still loading, which is what the caller retries on.
 */
function placeOnce(scene: SpaceBuilderScene, spot: Spot): boolean {
  const aim = scene.groundToClient(spot.x, spot.z);
  if (!aim) return false;
  scene.setGhostAt(aim.x, aim.y);
  return scene.placeGhostAsSingle();
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Rebuild the floor: clear every placed object, then put each card's current variant back
 * on its own spot. This is what the product's Replace action does — take the old object
 * out of the layout, build the new model, copy the old transform onto it.
 */
export async function placeVariants(
  scene: SpaceBuilderScene,
  picks: Pick[],
  isStale: () => boolean,
) {
  scene.clearArea();
  for (const { item, variant, spot } of picks) {
    scene.activateCatalogItem(item.id, variant);
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (isStale()) return;
      if (placeOnce(scene, spot)) break;
      await wait(120);
    }
  }
  scene.setGhostVisible(false);
}
