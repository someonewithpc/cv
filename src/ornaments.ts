/**
 * The things that lie on the desk round the paper, and where. Each theme keeps a few objects
 * and lays them in slots down the page's margins (components/Ornament.astro renders the
 * slots; pages/ornaments.astro shows every theme's set and the new ideas while Hugo picks).
 * The drawings are hand-drawn SVGs under assets/ornaments/, written by
 * scripts/draw-ornaments.mjs.
 */
import { OS_THEMES, type ThemeId } from '@/themes';

export type Ornament = {
  id: string;
  theme: ThemeId;
  title: string;
  why: string;
  how: string;
  /** From round 1 and reworked, as against one of the round 2 ideas. */
  kept: boolean;
};

export const ORNAMENTS: Ornament[] = [
  { id: 'light-daisy', theme: 'light', title: 'A daisy', kept: true, why: 'Hugo named it. A picked flower on a sunny desk, white on pale oak.', how: 'Petals of uneven length, one missing, two folded over; the stem kinked where it was snapped, a nick in the leaf.' },
  { id: 'light-pencil', theme: 'light', title: 'A chewed pencil', kept: true, why: 'The page is a drawing set; the pencil is what drew it.', how: 'The eraser worn to a slant, a dent in the ferrule, bite marks through the paint, a blunt lead, scuffs along the body.' },
  { id: 'light-paperclip', theme: 'light', title: 'A paperclip', kept: false, why: 'What a desk collects. Thin enough to lie in the gap between two sheets.', how: 'One stroke of wire with every point nudged, the inner loop bent out where it was used to open something.' },
  { id: 'dark-compass', theme: 'dark', title: 'A brass compass', kept: true, why: 'Night work at a drafting table. Brass is the one warm thing on the slate desk.', how: 'Tarnish in patches and scuffs clipped to each leg, the needle bent four degrees off, a chip in the knurl.' },
  { id: 'dark-watch', theme: 'dark', title: 'A pocket watch', kept: true, why: 'Late hour, moon theme. Steel and a cream dial stand out without adding colour.', how: 'The lid left open, standing on its hinge; the case scratched; the dial yellowed at one edge; the bow bent; the chain kinked.' },
  { id: 'dark-matchstick', theme: 'dark', title: 'A struck match', kept: false, why: 'Someone lit a candle here and put the match down. Small enough for a gap between sheets.', how: 'A stick that bends where the burn weakened it, charred black a third of the way, the head a crust with grey ash.' },
  { id: 'arctic-sprig', theme: 'arctic', title: 'A spruce sprig', kept: true, why: 'A twig off a northern tree, blue-green needles with frost on the tips.', how: 'Needles of every length, a tenth of them missing, some bent, a few yellowed, five dropped beside the stem, the stem snapped.' },
  { id: 'arctic-ticket', theme: 'arctic', title: 'A torn ticket', kept: false, why: 'A tram stub from a cold morning, in the blue-grey print the Arctic paper uses.', how: 'A torn edge from random points, one crease, printed lines as bars, a serial number, a perforation.' },
  { id: 'arctic-key', theme: 'arctic', title: 'A small key', kept: false, why: 'Cold steel on the cool desk, the key to nothing anyone remembers.', how: 'A bow bent out of round, tarnish and scratches clipped to the metal, a chipped tip.' },
  { id: 'forest-fern', theme: 'dark-forest', title: 'A fern frond', kept: true, why: 'Hugo named it. The forest floor, laid on smoked oak; the greens carry the theme.', how: 'Pinnae longer on one side than the other, two missing, three browned, each one bent its own way, the tip curling.' },
  { id: 'forest-acorns', theme: 'dark-forest', title: 'Two acorns', kept: true, why: 'The desk is oak, so this is what the tree drops on it.', how: 'One acorn in its cap and a smaller one out of it, the empty cap on its back beside them, scuffs on the nuts.' },
  { id: 'forest-pinecone', theme: 'dark-forest', title: 'A pine cone', kept: true, why: 'Picked up on a forest walk; its browns sit between the desk and the paper.', how: 'Scales of varied size and tilt, a tenth of them missing, an uneven outline, the stalk broken short.' },
  { id: 'forest-leaf', theme: 'dark-forest', title: 'A dried leaf', kept: false, why: 'Autumn on the forest desk, the one ochre thing among the greens.', how: 'A jittered outline, a curled edge showing the paler underside, two holes eaten in it, veins and blotches.' },
];

export const ORNAMENT_IDS = ORNAMENTS.map((ornament) => ornament.id);

/**
 * Where a thing can lie. Rows are #main's grid rows, one per sheet, named at both ends as
 * the folio's is, since an absolutely placed child's auto line is the grid's padding edge: 1 the title block, 2
 * Career, 3 the bill of materials, 4 the demos on their mat, 5 open source. title-start and
 * title-end lie 1.5rem off the 42rem title block's edges, out into the margin. end-N and start-N
 * are the right and left margins beside the column; the left margin holds the folio, so a
 * thing there lies in the half nearest the paper and only from 108rem, where that half is
 * clear of a 7.5rem numeral. mat-end is the margin beside the demos' mat, which is wider
 * than the column. gap-2 is the strip of desk between the Career sheet and the next one.
 */
export const SLOTS = ['title-start', 'title-end', 'end-2', 'end-3', 'end-5', 'start-2', 'start-5', 'mat-end', 'gap-2'] as const;
export type SlotName = (typeof SLOTS)[number];
const rowOf = (slot: SlotName) => (slot.endsWith('-2') ? 2 : slot.endsWith('-3') ? 3 : slot.endsWith('-5') ? 5 : slot === 'mat-end' ? 4 : 1);

export type Placement = {
  slot: SlotName;
  id: string;
  /** The drawing's width on the desk, rem. */
  size: number;
  /** Degrees, clockwise. */
  rotate: number;
  /** How far down its row, for the margin slots. */
  top?: string;
};

export const SETS: Record<ThemeId, Placement[]> = {
  light: [
    { slot: 'title-start', id: 'light-daisy', size: 6, rotate: -28 },
    { slot: 'title-end', id: 'light-pencil', size: 6.5, rotate: 34 },
    { slot: 'end-2', id: 'light-daisy', size: 7.5, rotate: 152, top: '28%' },
    { slot: 'gap-2', id: 'light-paperclip', size: 1.25, rotate: 82 },
    { slot: 'end-3', id: 'light-pencil', size: 5.5, rotate: -64, top: '18%' },
    { slot: 'start-2', id: 'light-pencil', size: 5.5, rotate: 18, top: '62%' },
    { slot: 'mat-end', id: 'light-daisy', size: 6.5, rotate: -98, top: '46%' },
    { slot: 'end-5', id: 'light-paperclip', size: 1.5, rotate: -24, top: '42%' },
    { slot: 'start-5', id: 'light-daisy', size: 6, rotate: 12, top: '74%' },
  ],
  dark: [
    { slot: 'title-start', id: 'dark-compass', size: 5.5, rotate: -16 },
    { slot: 'title-end', id: 'dark-watch', size: 6, rotate: 22 },
    { slot: 'end-2', id: 'dark-compass', size: 7, rotate: 164, top: '26%' },
    { slot: 'gap-2', id: 'dark-matchstick', size: 0.75, rotate: 84 },
    { slot: 'end-3', id: 'dark-watch', size: 6.5, rotate: -32, top: '22%' },
    { slot: 'start-2', id: 'dark-watch', size: 5.5, rotate: 8, top: '58%' },
    { slot: 'mat-end', id: 'dark-compass', size: 6.5, rotate: -118, top: '48%' },
    { slot: 'end-5', id: 'dark-matchstick', size: 1, rotate: -36, top: '38%' },
    { slot: 'start-5', id: 'dark-watch', size: 6, rotate: 26, top: '72%' },
  ],
  arctic: [
    { slot: 'title-start', id: 'arctic-sprig', size: 6, rotate: -34 },
    { slot: 'title-end', id: 'arctic-key', size: 2.5, rotate: 62 },
    { slot: 'end-2', id: 'arctic-sprig', size: 7.5, rotate: 148, top: '28%' },
    { slot: 'gap-2', id: 'arctic-key', size: 1, rotate: 88 },
    { slot: 'end-3', id: 'arctic-ticket', size: 6, rotate: -14, top: '26%' },
    { slot: 'start-2', id: 'arctic-sprig', size: 5.5, rotate: 24, top: '60%' },
    { slot: 'mat-end', id: 'arctic-ticket', size: 6, rotate: 22, top: '44%' },
    { slot: 'end-5', id: 'arctic-sprig', size: 7, rotate: -158, top: '76%' },
    { slot: 'start-5', id: 'arctic-key', size: 2.5, rotate: -72, top: '40%' },
  ],
  'dark-forest': [
    { slot: 'title-start', id: 'forest-fern', size: 6, rotate: -22 },
    { slot: 'title-end', id: 'forest-acorns', size: 6, rotate: 14 },
    { slot: 'end-2', id: 'forest-pinecone', size: 7, rotate: -26, top: '28%' },
    { slot: 'start-2', id: 'forest-leaf', size: 5, rotate: 38, top: '60%' },
    { slot: 'end-3', id: 'forest-fern', size: 7.5, rotate: 158, top: '14%' },
    { slot: 'mat-end', id: 'forest-acorns', size: 6, rotate: -42, top: '50%' },
    { slot: 'end-5', id: 'forest-leaf', size: 6, rotate: -16, top: '78%' },
    { slot: 'start-5', id: 'forest-pinecone', size: 6, rotate: 32, top: '36%' },
  ],
};

/** The URL and viewBox of every drawing, resolved at build time. */
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

/* The window width a placement needs, from the room its rotated drawing takes with 1.5rem
   of desk on either side: a margin slot beside the 60rem column, a title slot beside the
   42rem title block, the mat slot beside the mat at its widest, 82.625rem. */
const extent = ({ id, size, rotate }: Placement) => {
  const file = ornamentFile(id);
  const a = (rotate * Math.PI) / 180;
  const h = (size * file.height) / file.width;
  return { w: size, h, fw: size * Math.abs(Math.cos(a)) + h * Math.abs(Math.sin(a)), fh: size * Math.abs(Math.sin(a)) + h * Math.abs(Math.cos(a)) };
};
export const footprint = (placement: Placement) => extent(placement).fw;
const eighth = (n: number) => Math.ceil(n * 8) / 8;
export const showsFrom = (placement: Placement) => {
  const room = footprint(placement) + 3;
  switch (placement.slot) {
    case 'title-start': case 'title-end': return eighth(Math.max(64, 42 + 2 * room));
    case 'gap-2': return 65;
    case 'start-2': case 'start-5': return eighth(Math.max(108, 60 + 2 * room));
    case 'mat-end': return eighth(82.625 + 2 * room);
    default: return eighth(60 + 2 * room);
  }
};

/* A drawing turns about its own centre, so its box overhangs the unturned one by half the
   difference on each side; the slots that hang a drawing off an edge add that back. */
const varsOf = (placement: Placement) => {
  const file = ornamentFile(placement.id);
  const { w, h, fw, fh } = extent(placement);
  return `--ornament-image: url("${file.url}"); --ornament-ratio: ${file.width} / ${file.height}; --ornament-size: ${placement.size}rem; --ornament-rotate: ${placement.rotate}deg; --ornament-top: ${placement.top ?? '0'}; --ornament-overhang: ${eighth((fw - w) / 2)}rem; --ornament-overhang-block: ${eighth((fh - h) / 2)}rem;`;
};

/** A drawing on its own in the Career margin, for ?ornament=<theme>-<name>. */
export const single = (id: string): Placement => ({ slot: 'end-2', id, size: 8, rotate: 0, top: '20%' });

/**
 * The CSS for the drawings and their placements. Each slot is an absolutely placed child
 * of #main in its row and margin; the drawing is a background on a box of the drawing's own
 * aspect, so nothing is fetched for a slot that is not shown, and the shadow is the sheets'
 * lift, from above, deeper on a dark desk. A set shows when the root says
 * data-ornament="set" and the theme is that set's, by data-theme or, with no pick, the OS.
 * `.ornament-card` is the review page's own box for one drawing.
 */
export const ORNAMENT_CSS = `
.ornament {
  inline-size: var(--ornament-size, 9rem);
  aspect-ratio: var(--ornament-ratio);
  rotate: var(--ornament-rotate, 0deg);
  background: var(--ornament-image) center / contain no-repeat;
  filter:
    drop-shadow(0 1px 1px light-dark(rgb(0 0 0 / 35%), rgb(0 0 0 / 60%)))
    drop-shadow(0 0.375rem 0.5rem light-dark(rgb(0 0 0 / 22%), rgb(0 0 0 / 50%)));
}
.ornament-slot {
  display: none;
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.ornament-slot > .ornament {
  position: absolute;
}
.ornament-slot[data-slot="gap-2"] { grid-column: content; }
.ornament-slot[data-slot^="end-"] { grid-column: content-end / full-width-end; }
.ornament-slot[data-slot^="start-"] { grid-column: full-width-start / content-start; }
.ornament-slot[data-slot="mat-end"], .ornament-slot[data-slot^="title-"] { grid-column: full-width; }
.ornament-slot[data-slot="title-start"] > .ornament { inset-inline-end: calc(50% + 22.5rem + var(--ornament-overhang)); inset-block-end: calc(1rem + var(--ornament-overhang-block)); }
.ornament-slot[data-slot="title-end"] > .ornament { inset-inline-start: calc(50% + 22.5rem + var(--ornament-overhang)); inset-block-end: calc(1rem + var(--ornament-overhang-block)); }
.ornament-slot[data-slot^="end-"] > .ornament { inset-inline-start: 50%; inset-block-start: var(--ornament-top); translate: -50% 0; }
.ornament-slot[data-slot^="start-"] > .ornament { inset-inline-start: 75%; inset-block-start: var(--ornament-top); translate: -50% 0; }
.ornament-slot[data-slot="mat-end"] > .ornament { inset-inline-end: calc(var(--desk-edge) / 2); inset-block-start: var(--ornament-top); translate: 50% 0; }
.ornament-slot[data-slot="gap-2"] > .ornament { inset-inline-start: 70%; inset-block-start: calc(100% + 1.25rem); translate: -50% -50%; }
${SLOTS.map((slot) => `.ornament-slot[data-slot="${slot}"] { grid-row: ${rowOf(slot)} / ${rowOf(slot) + 1}; }`).join('\n')}
${Object.entries(SETS).flatMap(([theme, placements]) => placements.map((placement, i) => {
  const key = `${theme}:${i}`;
  const os = Object.entries(OS_THEMES).find(([, settings]) => settings.deskTile === theme)?.[0];
  return [
    `.ornament-slot[data-set="${key}"] { ${varsOf(placement)} }`,
    `@media (width >= ${showsFrom(placement)}rem) { :root[data-ornament="set"][data-theme="${theme}"] .ornament-slot[data-set="${key}"] { display: block; } }`,
    os ? `@media (prefers-color-scheme: ${os}) and (width >= ${showsFrom(placement)}rem) { :root[data-ornament="set"]:not([data-theme]) .ornament-slot[data-set="${key}"] { display: block; } }` : '',
  ].join('\n');
})).join('\n')}
${ORNAMENTS.map(({ id }) => [
  `.ornament-slot[data-single="${id}"] { ${varsOf(single(id))} }`,
  `@media (width >= ${showsFrom(single(id))}rem) { :root[data-ornament="${id}"] .ornament-slot[data-single="${id}"] { display: block; } }`,
].join('\n')).join('\n')}
${ORNAMENTS.map(({ id }) => `.ornament-card[data-ornament="${id}"] { ${varsOf({ slot: 'end-2', id, size: 9, rotate: 0 })} }`).join('\n')}
`;
