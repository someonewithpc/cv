/** Low-priority cache warm — never preload (that competes with LCP). */
async function warmAssets() {
  const { variantOf } = await import('@/components/SpaceBuilderDemo/MockScene/catalogItems');
  const { VARIANT_CARDS } = await import('./variantsCatalog');
  const opts = { credentials: 'same-origin', priority: 'low' } as RequestInit;
  void fetch('/demos/space-builder/chair.glb', opts).catch(() => null);
  for (const card of VARIANT_CARDS) {
    const url = variantOf(card, undefined).modelUrl;
    if (url) void fetch(url, opts).catch(() => null);
  }
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
