import { bootWhenVisible } from './bootWhenVisible';

type BootModule = { boot: (host: HTMLElement) => void | Promise<void> };

// Vite needs a static glob to resolve an import() whose target only shows up at runtime
// (the data attribute below) — this is the fixed set of modules that call is allowed to pick from.
// The bare `boot.ts` files (one per component directory) and the flat `layers/` directory's
// `*Layer.boot.ts` files (several boot modules sharing one directory, so they can't all be
// literally named boot.ts) both match `*boot.ts`.
const modules = import.meta.glob<BootModule>('/src/components/**/*boot.ts');

/**
 * Arms every unmounted `[data-boot-module]` island under `scope`, dynamically importing the
 * boot.ts named in that attribute and calling its `boot(host)` once the island is visible.
 *
 * A component reached only through `Astro.slots.render()` — PaperStack's per-page slot,
 * Stack.astro's per-layer slot — never gets its own hoisted <script> onto the page (see the
 * "dev-server-drops-demo-scripts" memory), because that API returns a plain string and
 * `set:html` has no channel for hoisted scripts. Routing the boot call instead through this
 * function, invoked from Stack.astro's own script (which the pagination doesn't touch), sidesteps
 * that — every interactive layer just needs a `boot.ts` and a `data-boot-module` pointing at it.
 *
 * The visibility root is `scope` itself (each stack, not the viewport): every page of a
 * PaperStack shares the same grid cell, so a viewport-rooted observer would (modulo the fold's
 * own clip-path also gating intersection) consider every layer visible at once rather than just
 * the one currently on top.
 */
export function armIslands(scope: HTMLElement) {
  scope.querySelectorAll<HTMLElement>('[data-boot-module]').forEach((host) => {
    if (host.dataset.mounted === 'true') return;
    const path = host.dataset.bootModule;
    const load = path ? modules[path] : undefined;
    if (!load) return;

    bootWhenVisible(
      host,
      async () => {
        if (host.dataset.mounted === 'true') return;
        host.dataset.mounted = 'true';
        try {
          const { boot } = await load();
          await boot(host);
        } catch (error) {
          console.debug('Island failed to boot', path, error);
          delete host.dataset.mounted;
        }
      },
      { root: scope },
    );
  });
}
