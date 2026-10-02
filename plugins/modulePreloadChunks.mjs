import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Every island's `<script type="module" src="...">` statically imports a few
 * shared chunks (fold-drag, pageIsland, themes, boot, ...), but the browser
 * only discovers those once the entry script has arrived and been parsed:
 * one extra round trip per import depth. modulepreload tells it about the
 * shared chunks up front, from the entry list already in the page, so the
 * requests start alongside the entry scripts instead of after them.
 */
export const modulePreloadChunks = () => {
  /** @type {Map<string, Set<string>>} entry chunk fileName -> its statically imported chunk fileNames (transitive, entry itself excluded) */
  const neededBy = new Map();

  /** @type {import('vite').Plugin} */
  const collect = {
    name: 'modulepreload-chunks',
    apply: 'build',
    enforce: 'post',
    applyToEnvironment: (environment) => environment.name === 'client',
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter((item) => item.type === 'chunk');
      const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
      for (const entry of chunks.filter((chunk) => chunk.isEntry)) {
        const needed = new Set();
        const walk = (chunk) => {
          for (const name of chunk.imports) {
            if (needed.has(name)) continue;
            needed.add(name);
            const imported = byName.get(name);
            if (imported) walk(imported);
          }
        };
        walk(entry);
        neededBy.set(entry.fileName, needed);
      }
    },
  };

  /** @type {import('astro').AstroIntegration} */
  return {
    name: 'modulepreload-chunks',
    hooks: {
      'astro:config:setup': ({ updateConfig }) => {
        updateConfig({ vite: { plugins: [collect] } });
      },
      'astro:build:done': async ({ dir, logger }) => {
        if (neededBy.size === 0) return;
        const root = fileURLToPath(dir);
        const pages = (await fs.readdir(root, { recursive: true, withFileTypes: true }))
          .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
          .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)));
        const entryScript = /<script type="module" src="[^"]*?\/([^"/]+\.js)"/g;
        for (const page of pages) {
          const file = path.join(root, page);
          const html = await fs.readFile(file, 'utf8');
          const onPage = new Set([...html.matchAll(entryScript)].map((m) => `_astro/${m[1]}`));
          const needed = new Set();
          for (const name of onPage) for (const dep of neededBy.get(name) ?? []) needed.add(dep);
          for (const name of onPage) needed.delete(name);
          if (needed.size === 0) continue;
          const links = [...needed].map((name) => `<link rel="modulepreload" href="/${name}">`).join('');
          const out = html.replace('</head>', `${links}</head>`);
          await fs.writeFile(file, out);
          logger.info(`${page}: ${needed.size} shared chunks modulepreloaded`);
        }
      },
    },
  };
};
