// A build-stable id, standing in for crypto.randomUUID() wherever a DOM id or SVG reference
// only needs to be unique within the document: same input, same output, so two builds of the
// same source produce byte-identical output (issue #220 C66). FNV-1a over the joined parts,
// base 36, fixed width so it reads like the hex slice it replaces.
export function deterministicId(...parts: (string | number)[]): string {
  const text = parts.join('\u0000');
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, '0');
}
