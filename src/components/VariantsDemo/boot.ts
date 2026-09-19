/**
 * Low-priority cache warm — never preload (that competes with LCP). Every style is warmed,
 * not just the ones on show: a pick clears the floor and rebuilds it, so a model still in
 * flight is a gap where the object was.
 */
async function warmAssets() {
  const { variantsOf } = await import('@/components/SpaceBuilderDemo/MockScene/catalogItems');
  const { VARIANT_CARDS } = await import('./variantsCatalog');
  const opts = { credentials: 'same-origin', priority: 'low' } as RequestInit;
  const urls = new Set(['/demos/space-builder/chair.glb']);
  for (const card of VARIANT_CARDS) {
    for (const variant of variantsOf(card)) {
      if (variant.modelUrl) urls.add(variant.modelUrl);
    }
  }
  for (const url of urls) void fetch(url, opts).catch(() => null);
}

export async function boot(host: HTMLElement) {
  void warmAssets();

  // Yield so other work can finish a frame before Vue+Three parse.
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });

  const [{ createApp }, { default: VariantsApp }] = await Promise.all([
    import('vue'),
    import('./VariantsApp.vue'),
  ]);

  const app = createApp(VariantsApp);
  app.mount(host);
  host.querySelector('.boot-placeholder')?.remove();
}
