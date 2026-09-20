import { DEFAULT_FAMILY, useFontOverride } from './fontOverride';

// Set in whatever the demo currently wears, including a face being previewed from the
// dropdown: the override reaches it like the sidebar beside it
export function Specimen() {
  const { shown } = useFontOverride();

  const family = [shown.family ?? DEFAULT_FAMILY, shown.style !== 'normal' && shown.style]
    .filter(Boolean)
    .join(' ');

  return (
    <figure className="specimen">
      <p className="specimen-display" aria-hidden="true">Aa</p>
      <p className="specimen-pangram">The quick brown fox jumps over the lazy dog</p>
      <p className="specimen-glyphs" aria-hidden="true">
        ABCDEFGHIJKLMNOPQRSTUVWXYZ<br />
        abcdefghijklmnopqrstuvwxyz<br />
        0123456789 !?&amp;@%
      </p>
      <figcaption>
        <span><span className="monospace">Family</span> {family}</span>
        <span><span className="monospace">Weight</span> {shown.weight ?? 400}</span>
        <span><span className="monospace">Size</span> {shown.size}em</span>
      </figcaption>
    </figure>
  );
}
