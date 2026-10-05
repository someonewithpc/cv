import chairUrl from '@/assets/demos/space-builder/chair.glb?url';
import grassColorUrl from '@/assets/demos/space-builder/grass/color.webp?url';
import grassDisplacementUrl from '@/assets/demos/space-builder/grass/displacement.webp?url';
import grassNormalUrl from '@/assets/demos/space-builder/grass/normal.webp?url';

const CHAIR_URL = chairUrl;
const GRASS_URLS = [
  grassColorUrl,
  grassNormalUrl,
  grassDisplacementUrl,
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
  // useId() ids are per app; both scene apps share a page.
  app.config.idPrefix = 'space-builder';
  app.mount(host);
  host.querySelector('.boot-placeholder')?.remove();
}
