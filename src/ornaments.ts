/**
 * The objects that can lie on the desk beside the paper, three per theme while Hugo picks
 * (components/Ornament.astro shows one; pages/ornaments.astro shows them all). Each is a
 * hand-drawn SVG under assets/ornaments/, written by scripts/draw-ornaments.mjs.
 */
import type { ThemeId } from '@/themes';

export type Ornament = {
  id: string;
  theme: ThemeId;
  title: string;
  why: string;
  how: string;
};

export const ORNAMENTS: Ornament[] = [
  { id: 'light-daisy', theme: 'light', title: 'A daisy', why: 'Hugo named it. A picked flower on a sunny desk, white on pale oak.', how: '19 petals from one path, a shade gradient masked to the head, a dotted disc, a stem and one leaf.' },
  { id: 'light-pencil', theme: 'light', title: 'A sharpened pencil', why: 'The page is a drawing set; the pencil is what drew it. Yellow reads on the warm desk.', how: 'Three faces of the hexagon as stripes, ferrule, eraser, a wood cone and a graphite tip, rotated 62 degrees.' },
  { id: 'light-shell', theme: 'light', title: 'A scallop shell', why: 'Summer and the Lisbon coast, in the same peach as the desk, a shade deeper.', how: 'A fan of 13 arcs with a radial gradient, each rib a light line over a dark one, a shade band at the hinge.' },
  { id: 'dark-compass', theme: 'dark', title: 'A brass drawing compass', why: 'Night work at a drafting table. Brass is the one warm thing on the slate desk.', how: 'Two tapered legs on a knurled hinge, gradients across each leg, a steel needle and a graphite lead.' },
  { id: 'dark-watch', theme: 'dark', title: 'A steel pocket watch', why: 'Late hour, moon theme. Steel and a cream dial stand out without adding colour.', how: 'Case rings, a cream dial with 60 ticks and four numerals, blued hands, a bow and four chain links.' },
  { id: 'dark-moth', theme: 'dark', title: 'A moth at rest', why: 'What comes to a lamp at night. Pale wings read on near-black oak.', how: 'One wing drawn and mirrored, two wavy bands and an eyespot, a furred thorax and combed antennae.' },
  { id: 'arctic-sprig', theme: 'arctic', title: 'A spruce sprig', why: 'A twig off a northern tree, blue-green needles with frost on the tips.', how: 'Needles grown along a quadratic stem, 90 of them, a few ending in a white dot of frost.' },
  { id: 'arctic-pebble', theme: 'arctic', title: 'Two river pebbles', why: 'Grey stone on grey-pink limed oak, the quietest of the twelve.', how: 'Two blobs with radial gradients lit from the top left, 70 speckles on the larger one.' },
  { id: 'arctic-feather', theme: 'arctic', title: 'A white feather', why: 'Gull or owl, white on the pale cool desk, splits in the vane where it has been handled.', how: 'A vane silhouette under 130 barbs grown along a quadratic shaft, a cream quill, down at the base.' },
  { id: 'forest-fern', theme: 'dark-forest', title: 'A fern frond', why: 'Hugo named it. The forest floor, laid on smoked oak; the greens carry the theme.', how: '34 lobed pinnae grown along a curved rachis, each a gradient from dark base to light tip.' },
  { id: 'forest-acorns', theme: 'dark-forest', title: 'Two acorns and an oak leaf', why: 'The desk is oak, so this is what the tree drops on it.', how: 'Nuts with radial gradients, caps with a scale pattern, one lobed leaf with veins.' },
  { id: 'forest-pinecone', theme: 'dark-forest', title: 'A pine cone', why: 'Picked up on a forest walk; its browns sit between the desk and the paper.', how: 'Scales laid in nine columns from tip to stalk, clipped to the cone, darker toward the edges.' },
];

export const ORNAMENT_IDS = ORNAMENTS.map((ornament) => ornament.id);

/** The URL and viewBox of every candidate's file, resolved at build time. */
const FILES = import.meta.glob<string>('/src/assets/ornaments/*.svg', { query: '?no-inline', eager: true, import: 'default' });
const RAW = import.meta.glob<string>('/src/assets/ornaments/*.svg', { query: '?raw', eager: true, import: 'default' });

export const ornamentFile = (id: string) => {
  const key = `/src/assets/ornaments/${id}.svg`;
  const url = FILES[key];
  const raw = RAW[key];
  if (!url || !raw) throw new Error(`No ornament ${key}`);
  const box = raw.match(/viewBox="0 0 (\d+) (\d+)"/);
  if (!box) throw new Error(`No viewBox in ${key}`);
  return { url, width: Number(box[1]), height: Number(box[2]), bytes: Buffer.byteLength(raw) };
};

/**
 * The CSS that makes a .ornament show one candidate: its image and its shape. The image is a
 * background, not an <img>, so a candidate not picked is never fetched. The shadow is the
 * sheets' lift (Layout.astro), from above, in two layers, deeper on a dark desk.
 */
export const ORNAMENT_CSS = `
.ornament {
  inline-size: 9rem;
  aspect-ratio: var(--ornament-ratio);
  background: var(--ornament-image) center / contain no-repeat;
  filter:
    drop-shadow(0 1px 1px light-dark(rgb(0 0 0 / 35%), rgb(0 0 0 / 60%)))
    drop-shadow(0 0.375rem 0.5rem light-dark(rgb(0 0 0 / 22%), rgb(0 0 0 / 50%)));
}
${ORNAMENTS.map((ornament) => {
  const file = ornamentFile(ornament.id);
  return `.ornament[data-ornament="${ornament.id}"],\n:root[data-ornament="${ornament.id}"] .ornament:not([data-ornament]) {\n  --ornament-image: url("${file.url}");\n  --ornament-ratio: ${file.width} / ${file.height};\n}`;
}).join('\n')}
`;
