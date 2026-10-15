import path from 'node:path';

import * as esbuild from 'esbuild';

// Resolve from cwd: import.meta.url points at dist prerender chunks during build.
const srcRoot = path.join(process.cwd(), 'src');

const weights = new Map<string, Promise<string>>();

/**
 * A title block's weight: the script a sheet ships, bundled and minified, without the npm
 * packages it imports, its stylesheets or its asset files. Sheets that run the same entry
 * share one build.
 */
export function scriptWeight(entry: string): Promise<string> {
  let weight = weights.get(entry);
  if (!weight) {
    weight = measure(entry);
    weights.set(entry, weight);
  }
  return weight;
}

async function measure(entry: string) {
  const { outputFiles: [bundle] } = await esbuild.build({
    entryPoints: [path.join(srcRoot, entry)],
    bundle: true,
    minify: true,
    write: false,
    format: 'esm',
    packages: 'external',
    // Asset URLs (chair.glb?url) are strings Vite fills in.
    external: ['*?url'],
    alias: { '@': srcRoot },
    loader: { '.scss': 'empty', '.css': 'empty' },
  });
  return `${Math.ceil((bundle.text.length / 1024) * 10) / 10}KiB`;
}
