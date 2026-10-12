/* One chassis, three glyphs: a cassette key drawn from the top left, so its cap has a
   front and a side face to drop onto when it is held down. Each glyph sits in the cap's
   own box (x 1 to 18, y 1 to 13), cut wide enough to still read at a 12px key. */
export const transportKeys = [
  {
    id: 'reset',
    label: 'Reset the walkthrough',
    glyph: '<path d="M4.6 3.4v7.2" /><path d="M10 3.4 6.6 7 10 10.6Z" /><path d="M14.4 3.4 11 7l3.4 3.6Z" />',
  },
  {
    id: 'play',
    label: 'Play the walkthrough',
    glyph: '<path d="M6.6 2.9 13.9 7l-7.3 4.1Z" />',
  },
  {
    id: 'pause',
    label: 'Take over',
    glyph: '<path d="M6.6 3.2h2.3v7.6H6.6z" /><path d="M10.6 3.2h2.3v7.6h-2.3z" />',
  },
] as const;

/** The id of a key's artwork in TransportKeyArt.astro, which every sheet's deck shows through <use>. */
export const transportKeyArtId = (id: string) => `demo-key-art-${id}`;
