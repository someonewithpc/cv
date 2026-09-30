// playwright-core bundles pngjs here and ships no types for it; this is the part the specs use.
declare module 'playwright-core/lib/utilsBundle' {
  export const PNG: {
    sync: { read(buffer: Buffer): { width: number; height: number; data: Buffer } };
  };
}
