import fs from 'node:fs/promises';
import path from 'node:path';
import { runnerImport } from 'vite';

/** A JS value as Sass: strings quoted, arrays as comma lists, plain objects as maps. */
const toSass = (value) => {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `(${value.map(toSass).join(', ')},)`;
  return `(${Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}: ${toSass(item)}`).join(', ')})`;
};

const kebab = (name) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

/**
 * A Sass importer for `@use "ts:<path from the project root>"`: it loads that TypeScript
 * module through Vite, so `@/` imports resolve, and serves its `sass` export as Sass
 * variables, `{ themeTones }` as `$theme-tones`. A component's static `<style lang="scss">`
 * can then loop over build-time data (theme ids, a demo's keys) and Astro bundles the
 * result, where CSS built as a string at render time stays an inline `<style>` wherever
 * the template puts it.
 *
 * @param {{ root: string, alias: import('vite').Alias[] }} options
 * @returns {import('sass').Importer<'async'>}
 */
export const sassFromTs = ({ root, alias }) => {
  /** @type {Map<string, { stamp: string, files: string[], contents: string }>} */
  const cache = new Map();
  const stampOf = async (files) => (
    await Promise.all(files.map((file) => fs.stat(file).then((stat) => stat.mtimeMs, () => 0)))
  ).join(',');

  return {
    canonicalize(url) {
      return url.startsWith('ts:') ? new URL(url) : null;
    },
    async load(url) {
      const file = path.resolve(root, url.pathname);
      const hit = cache.get(file);
      if (hit && hit.stamp === await stampOf(hit.files)) return { contents: hit.contents, syntax: /** @type {const} */ ('scss') };
      const { module, dependencies } = await runnerImport(file, {
        configFile: false,
        root,
        logLevel: 'error',
        resolve: { alias },
      });
      if (!module.sass) throw new Error(`${url.pathname} has no \`sass\` export`);
      const contents = Object.entries(module.sass)
        .map(([name, value]) => `$${kebab(name)}: ${toSass(value)};`)
        .join('\n');
      const files = [file, ...dependencies.map((dep) => path.resolve(root, dep))];
      cache.set(file, { stamp: await stampOf(files), files, contents });
      return { contents, syntax: /** @type {const} */ ('scss') };
    },
  };
};
