/** A library category: the key the product stores on `library_objects.category`. */
export type Category = 'Banquet' | 'Reception' | 'Sofa' | 'Catering' | 'Outdoor' | 'Plants';

export type LibraryObject = {
  id: string;
  name: string;
  category: Category;
  /** The render the product shows on the object's card. */
  image: string;
  /** The typed properties, in the order the librarian added them. The property schema is
      per category, so a name means whatever that category's librarian meant by it. */
  properties: readonly (readonly [name: string, value: string])[];
  pax?: number;
  /** Centimetres, `WxDxH`, as `library_objects.size` stores it. */
  size?: string;
};

const IMAGES = '/demos/library-search';

/* Objects from the Space Builder library, the ones the other demos already carry renders
   of: the 2800 Chiavari chair in five of its finishes, the banquet tables at their real
   seat counts and sizes, and the rest of the catalogue. Each finish and each seat count
   is its own object in the product, so it is here too. */
export const libraryObjects: readonly LibraryObject[] = [
  { id: '3121', name: 'Chiavari Chair', category: 'Banquet', image: `${IMAGES}/chair-natural.webp`, properties: [['chair', 'Chiavari'], ['color', 'Natural'], ['material', 'Wood']], pax: 1, size: '42x50x95' },
  { id: '3122', name: 'Chiavari Chair', category: 'Banquet', image: `${IMAGES}/chair-gold.webp`, properties: [['chair', 'Chiavari'], ['color', 'Gold'], ['material', 'Wood']], pax: 1, size: '42x50x95' },
  { id: '3123', name: 'Chiavari Chair', category: 'Banquet', image: `${IMAGES}/chair-silver.webp`, properties: [['chair', 'Chiavari'], ['color', 'Silver'], ['material', 'Wood']], pax: 1, size: '42x50x95' },
  { id: '3124', name: 'Chiavari Chair', category: 'Banquet', image: `${IMAGES}/chair-white.webp`, properties: [['chair', 'Chiavari'], ['color', 'White'], ['material', 'Wood']], pax: 1, size: '42x50x95' },
  { id: '3125', name: 'Chiavari Chair', category: 'Banquet', image: `${IMAGES}/chair-black.webp`, properties: [['chair', 'Chiavari'], ['color', 'Black'], ['material', 'Wood']], pax: 1, size: '42x50x95' },
  { id: '3140', name: 'Banquet Table', category: 'Banquet', image: `${IMAGES}/banquet-8.webp`, properties: [['shape', 'Rectangular'], ['chair', 'Chiavari'], ['color', 'White'], ['material', 'Linen']], pax: 8, size: '243x121' },
  { id: '3141', name: 'Banquet Table', category: 'Banquet', image: `${IMAGES}/banquet-6.webp`, properties: [['shape', 'Rectangular'], ['chair', 'Chiavari'], ['color', 'White'], ['material', 'Linen']], pax: 6, size: '243x121' },
  { id: '3142', name: 'Banquet Table', category: 'Banquet', image: `${IMAGES}/banquet-4.webp`, properties: [['shape', 'Rectangular'], ['chair', 'Chiavari'], ['color', 'White'], ['material', 'Linen']], pax: 4, size: '243x121' },
  { id: '3143', name: 'Banquet Table', category: 'Banquet', image: `${IMAGES}/banquet-6-narrow.webp`, properties: [['shape', 'Rectangular'], ['chair', 'Chiavari'], ['color', 'White'], ['material', 'Linen']], pax: 6, size: '182x76' },
  { id: '3150', name: 'Round Table', category: 'Banquet', image: `${IMAGES}/round-table.webp`, properties: [['shape', 'Round'], ['chair', 'Chiavari'], ['color', 'White'], ['material', 'Linen']], pax: 8, size: '152' },
  { id: '3151', name: 'Round Table', category: 'Banquet', image: `${IMAGES}/round-table.webp`, properties: [['shape', 'Round'], ['chair', 'Chiavari'], ['color', 'White'], ['material', 'Linen']], pax: 10, size: '183' },
  { id: '3210', name: 'Cocktail Table', category: 'Reception', image: `${IMAGES}/cocktail-table.webp`, properties: [['shape', 'Round'], ['color', 'White'], ['material', 'Linen']], size: '76x76x110' },
  { id: '3211', name: 'Barstool', category: 'Reception', image: `${IMAGES}/barstool.webp`, properties: [['color', 'Black'], ['material', 'Steel']], pax: 1, size: '40x40x75' },
  { id: '3212', name: 'Bar', category: 'Reception', image: `${IMAGES}/bar.webp`, properties: [['color', 'White'], ['material', 'Wood']], pax: 10, size: '500x60x110' },
  { id: '3310', name: 'Sofa', category: 'Sofa', image: `${IMAGES}/sofa.webp`, properties: [['color', 'Beige'], ['material', 'Fabric']], pax: 3, size: '210x90x85' },
  { id: '3311', name: 'Side Chair', category: 'Sofa', image: `${IMAGES}/side-chair.webp`, properties: [['color', 'Beige'], ['material', 'Fabric']], pax: 1, size: '49x53x91' },
  { id: '3410', name: 'Buffet Table', category: 'Catering', image: `${IMAGES}/buffet-table.webp`, properties: [['shape', 'Rectangular'], ['color', 'White'], ['material', 'Linen']], size: '183x76x76' },
  { id: '3510', name: 'Outdoor Table With Umbrella', category: 'Outdoor', image: `${IMAGES}/umbrella-table.webp`, properties: [['color', 'Grey'], ['material', 'Aluminium']], pax: 4, size: '120x120x230' },
  { id: '3610', name: 'Flower Pot', category: 'Plants', image: `${IMAGES}/flower-pot.webp`, properties: [['color', 'White'], ['material', 'Fibreglass']], size: '40x40x60' },
];

const CM_PER_INCH = 2.54;

/** The six renderings of a size, under the names the product stores them as (#124 draws
    them in full): every dimension in each unit, joined with ' by '. */
function sizeProperties(size: string): [string, string][] {
  const cms = size.split('x').map(Number);
  const inches = (cm: number) => Math.round(cm / CM_PER_INCH);
  const feet = (cm: number) => [Math.floor(inches(cm) / 12), inches(cm) % 12] as const;
  const each = (render: (cm: number) => string) => cms.map(render).join(' by ');
  return [
    ['Size (centimeters)', each((cm) => `${cm}cm`)],
    ['Size (meters)', each((cm) => `${cm / 100}m`)],
    ['Size (inches)', each((cm) => `${inches(cm)}"`)],
    ['Size (inches)', each((cm) => `${inches(cm)}in`)],
    ['Size (feet-inches)', each((cm) => `${feet(cm)[0]}'${feet(cm)[1]}"`)],
    ['Size (feet-inches)', each((cm) => `${feet(cm)[0]}ft${feet(cm)[1]}in`)],
  ];
}

/** Every row of `library_object_synthetic_properties` for one object: the typed
    properties, the seat count under both of its names, and the six size renderings. */
export function syntheticProperties(object: LibraryObject): readonly (readonly [string, string])[] {
  return [
    ...object.properties,
    ...(object.pax === undefined ? [] : [['Pax', String(object.pax)], ['Seats', String(object.pax)]] as const),
    ...(object.size === undefined ? [] : sizeProperties(object.size)),
  ];
}

/** What the trigger keeps in the one FULLTEXT-indexed column per object,
    GROUP_CONCAT(CONCAT(value, ' ', name) SEPARATOR ' '): value then name, one space
    between everything. The category is a column of the object, filtered on, never
    matched; the name is not a property, so it is not matched either. */
export function concatenatedValues(object: LibraryObject) {
  return syntheticProperties(object)
    .map(([name, value]) => `${value} ${name}`)
    .join(' ');
}

/** The line under a result's name. */
export function detailsOf(object: LibraryObject) {
  return [
    ...object.properties.filter(([name]) => name !== 'chair').map(([, value]) => value),
    object.pax === undefined ? null : `${object.pax} pax`,
    object.size === undefined ? null : `${object.size} cm`,
  ]
    .filter(Boolean)
    .join(' · ');
}

export const categories: readonly Category[] = [...new Set(libraryObjects.map((object) => object.category))];

/** The property filter offers the values already stored under the name, the way the
    product's advanced search lists them. */
export const colors: readonly string[] = [
  ...new Set(libraryObjects.flatMap((object) => object.properties.filter(([name]) => name === 'color').map(([, value]) => value))),
].sort();

/** The query the page opens on: a shape and a seat count, where the object with both
    comes first and the one with the rarer term comes next. */
export const initialQuery = 'rectangular 8 seats';

/** The walkthrough's script: each step is typed into the field, then held long enough to
    read the bars. `color` sets the property filter instead of typing. Each step shows one
    thing: two plain words, where the rarer weighs more; a property filter; one word; a seat
    count the rewrite quotes into a phrase. A bare `chair` would also match, just as
    strongly, every table that lists the chairs set round it. */
export const walkthrough: readonly { type?: string; clear?: boolean; color?: string; hold: number }[] = [
  { clear: true, type: 'wood chair', hold: 2600 },
  { color: 'Gold', hold: 2600 },
  { color: '', hold: 800 },
  { clear: true, type: 'rectangular', hold: 2200 },
  { type: ' 8 seats', hold: 3000 },
];

/** What tells two objects of one name apart on a sheet: the finish, and the seat count. */
export function variantOf(object: LibraryObject) {
  const color = object.properties.find(([name]) => name === 'color')?.[1];
  return [color, object.pax === undefined ? null : `${object.pax} pax`].filter(Boolean).join(' · ');
}
