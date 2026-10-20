import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Astro links every stylesheet a page's scripts can reach into <head>,
 * dynamic imports included, so the lazily booted islands' sheets block the
 * first render. Vite's preload helper already loads a dynamic chunk's CSS and
 * waits for it before the import resolves, so those links can go: each sheet
 * then arrives with its island, and before it mounts.
 *
 * The helper links each sheet at the end of <head>, which puts it before the
 * <style> elements in the body. Safari only takes its cheap path for a new
 * sheet when it comes after every other sheet in the document. Anywhere else
 * it rebuilds the style of the whole page, about 380 ms at 1440 px, once per
 * island. So the helper links them at the end of <body> instead.
 */
export const lazyIslandStylesheets = () => {
  /** @type {Set<string>} */
  const lazy = new Set();

  /** @type {import('vite').Plugin} */
  const collect = {
    name: 'lazy-island-stylesheets',
    apply: 'build',
    enforce: 'post',
    applyToEnvironment: (environment) => environment.name === 'client',
    transform: {
      filter: { id: /^\0vite\/preload-helper\.js$/ },
      handler(code) {
        const head = 'document.head.appendChild(link)';
        const count = code.split(head).length - 1;
        if (count !== 1) this.error(`Expected one ${head} in Vite's preload helper, found ${count}`);
        return { code: code.replace(head, 'document.body.appendChild(link)'), map: null };
      },
    },
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter((item) => item.type === 'chunk');
      const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
      const eager = new Set();
      const walk = (chunk) => {
        if (eager.has(chunk.fileName)) return;
        eager.add(chunk.fileName);
        for (const name of chunk.imports) {
          const imported = byName.get(name);
          if (imported) walk(imported);
        }
      };
      for (const chunk of chunks) if (chunk.isEntry) walk(chunk);

      const eagerCss = new Set();
      for (const chunk of chunks) {
        const css = chunk.viteMetadata?.importedCss ?? new Set();
        for (const file of css) (eager.has(chunk.fileName) ? eagerCss : lazy).add(file);
      }
      for (const file of eagerCss) lazy.delete(file);
    },
  };

  /** @type {import('astro').AstroIntegration} */
  return {
    name: 'lazy-island-stylesheets',
    hooks: {
      'astro:config:setup': ({ updateConfig }) => {
        updateConfig({ vite: { plugins: [collect] } });
      },
      'astro:build:done': async ({ dir, logger }) => {
        if (lazy.size === 0) return;
        const root = fileURLToPath(dir);
        const pages = (await fs.readdir(root, { recursive: true, withFileTypes: true }))
          .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
          .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)));
        const link = /<link rel="stylesheet" href="[^"]*?\/([^"/]+\.css)"\s*\/?>/g;
        for (const page of pages) {
          const file = path.join(root, page);
          const html = await fs.readFile(file, 'utf8');
          let dropped = 0;
          const out = html.replace(link, (tag, name) =>
            lazy.has(`_astro/${name}`) ? (dropped++, '') : tag,
          );
          if (dropped === 0) continue;
          await fs.writeFile(file, out);
          logger.info(`${page}: ${dropped} island stylesheets left to their islands`);
        }
      },
    },
  };
};
