/**
 * Every file under src/assets/demos/space-builder/, by its path below that folder, as the
 * hashed URL the build emits for it under _astro/. Names a table builds at runtime (catalog
 * thumbnails, banquet models, rail icons) look up here instead of a fixed public/ path.
 */
const FILES = import.meta.glob<string>('/src/assets/demos/space-builder/**/*', {
  query: '?url',
  eager: true,
  import: 'default',
});

export function spaceBuilderAsset(path: string): string {
  const url = FILES[`/src/assets/demos/space-builder/${path}`];
  if (!url) throw new Error(`No Space Builder asset src/assets/demos/space-builder/${path}`);
  return url;
}
