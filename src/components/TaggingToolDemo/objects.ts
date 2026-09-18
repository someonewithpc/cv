import round10 from './thumbs/round-10.png?url';
import round4 from './thumbs/round-4.png?url';
import round6 from './thumbs/round-6.png?url';
import round8 from './thumbs/round-8.png?url';
import gold40 from './thumbs/gold-40.png?url';
import gold20 from './thumbs/gold-20.png?url';
import gold10 from './thumbs/gold-10.png?url';
import gold30 from './thumbs/gold-30.png?url';

export type Values = Readonly<Record<string, string | null>>;

export type LibraryObject = {
  id: string;
  name: string;
  details: string;
  image: string;
  /** One stored value per property schema; null is a gap the page exists to fill. */
  values: Values;
};

export type BaseObject = {
  id: string;
  autoplay?: boolean;
  base: LibraryObject;
  variants: readonly LibraryObject[];
};

export type Property = { id: string; name: string };

/** Schema names are stored lowercase and shown titleized, as index.html.haml does. */
export const properties: readonly Property[] = [
  { id: 'table color', name: 'Table Color' },
  { id: 'linen', name: 'Linen' },
  { id: 'chair', name: 'Chair' },
];

export const defaultProperty = properties[0].id;

/** The walkthrough's script: tag a whole object through the shared field, switch to a
    property that already has values, then override one variant by hand. */
export const walkthrough = {
  value: 'Champagne',
  storedProperty: 'linen',
  overrideValue: 'Oyster',
  /** Which object of the auto-played row gets the hand-typed override. */
  overrideIndex: 2,
};

/* Real objects from the Banquet category, thumbnails included. Two base objects fill the
   sheet at the product's card size, and both keep a gap so the page still lists them. */
export const baseObjects: readonly BaseObject[] = [
  {
    id: 'round',
    autoplay: true,
    base: {
      id: 'round-10',
      name: 'Banquet Set',
      details: '10 seats, 1.82m',
      image: round10,
      values: { 'table color': null, linen: 'Ivory Satin', chair: null },
    },
    variants: [
      {
        id: 'round-4',
        name: 'Banquet Set',
        details: '4 seats, 1.82m',
        image: round4,
        values: { 'table color': null, linen: 'Ivory Satin', chair: null },
      },
      {
        id: 'round-6',
        name: 'Banquet Set',
        details: '6 seats, 1.82m',
        image: round6,
        values: { 'table color': null, linen: 'Ivory Satin', chair: null },
      },
      {
        id: 'round-8',
        name: 'Banquet Set',
        details: '8 seats, 1.82m',
        image: round8,
        values: { 'table color': null, linen: null, chair: null },
      },
    ],
  },
  {
    id: 'gold',
    base: {
      id: 'gold-40',
      name: 'Banquet Set',
      details: 'Rectangular Set, 40 seats, 1.45m x 11.25m',
      image: gold40,
      values: { 'table color': 'White and Beige', linen: 'Blush', chair: null },
    },
    variants: [
      {
        id: 'gold-20',
        name: 'Banquet Set',
        details: '20 seats, 1.45m x 5.7m',
        image: gold20,
        values: { 'table color': 'White and Beige', linen: 'Blush', chair: null },
      },
      {
        id: 'gold-10',
        name: 'Banquet Set',
        details: '10 seats, 1.45m x 3.4m',
        image: gold10,
        values: { 'table color': null, linen: 'Blush', chair: null },
      },
      {
        id: 'gold-30',
        name: 'Banquet Set',
        details: '30 seats, 1.45m x 8.5m',
        image: gold30,
        values: { 'table color': 'White and Beige', linen: null, chair: null },
      },
    ],
  },
];

export function objectsOf(group: BaseObject) {
  return [group.base, ...group.variants];
}

/** Mirrors _object.html.haml: shared when nothing is set, or when every object agrees. */
export function sharedState(group: BaseObject, property: string) {
  const objects = objectsOf(group);
  const stored = objects
    .map((object) => object.values[property] ?? null)
    .filter((value): value is string => value !== null);
  const distinct = [...new Set(stored)];
  const shared = stored.length === 0 || (stored.length === objects.length && distinct.length === 1);
  return { shared, value: shared ? (distinct[0] ?? '') : '', overrides: distinct };
}

export function isComplete(group: BaseObject, property: string) {
  return objectsOf(group).every((object) => (object.values[property] ?? null) !== null);
}

export function usedValues(property: string) {
  return [
    ...new Set(
      baseObjects.flatMap((group) => objectsOf(group).map((object) => object.values[property] ?? null)),
    ),
  ]
    .filter((value): value is string => value !== null)
    .sort();
}
