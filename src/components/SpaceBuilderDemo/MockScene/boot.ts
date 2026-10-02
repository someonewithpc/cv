const CHAIR_URL = '/demos/space-builder/chair.glb';
const GRASS_URLS = [
  '/demos/space-builder/grass/color.webp',
  '/demos/space-builder/grass/normal.webp',
  '/demos/space-builder/grass/displacement.webp',
] as const;

/** Low-priority cache warm — never preload (that competes with LCP). */
function warmAssets() {
  const opts = { credentials: 'same-origin', priority: 'low' } as RequestInit;
  void fetch(CHAIR_URL, opts).catch(() => null);
  for (const url of GRASS_URLS) void fetch(url, opts).catch(() => null);
}

export async function boot(host: HTMLElement) {
  warmAssets();

  // Yield so other work can finish a frame before Vue+Three parse.
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });

  const [{ createApp }, { default: MockSceneApp }] = await Promise.all([
    import('vue'),
    import('./MockSceneApp.vue'),
  ]);

  const app = createApp(MockSceneApp);
  app.mount(host);
  host.querySelector('.boot-placeholder')?.remove();
}
