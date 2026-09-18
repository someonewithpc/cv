import round10 from './thumbs/round-10.png?url';
import round4 from './thumbs/round-4.png?url';
import round6 from './thumbs/round-6.png?url';
import round8 from './thumbs/round-8.png?url';
import gold40 from './thumbs/gold-40.png?url';
import gold20 from './thumbs/gold-20.png?url';
import gold10 from './thumbs/gold-10.png?url';
import gold30 from './thumbs/gold-30.png?url';
import silver40 from './thumbs/silver-40.png?url';
import silver10 from './thumbs/silver-10.png?url';
import silver20 from './thumbs/silver-20.png?url';
import silver30 from './thumbs/silver-30.png?url';
import long6 from './thumbs/long-6.png?url';
import long8 from './thumbs/long-8.png?url';
import long0 from './thumbs/long-0.png?url';

export type LibraryObject = {
  id: string;
  name: string;
  details: string;
  image: string;
  value: string | null;
};

export type BaseObject = {
  id: string;
  autoplay?: boolean;
  base: LibraryObject;
  styles: readonly LibraryObject[];
};

/** Schema names are stored lowercase; the product shows them as typed. */
export const property = 'table color';

export const autoplayValue = 'Champagne';

/* Real objects from the Banquet category, thumbnails included; the values are
   arranged so every row still has a gap to fill, which is what the page lists. */
export const baseObjects: readonly BaseObject[] = [
  {
    id: 'round',
    autoplay: true,
    base: { id: 'round-10', name: 'Banquet Set', details: '10 seats, 1.82m', image: round10, value: null },
    styles: [
      { id: 'round-4', name: 'Banquet Set', details: '4 seats, 1.82m', image: round4, value: null },
      { id: 'round-6', name: 'Banquet Set', details: '6 seats, 1.82m', image: round6, value: null },
      { id: 'round-8', name: 'Banquet Set', details: '8 seats, 1.82m', image: round8, value: null },
    ],
  },
  {
    id: 'gold',
    base: { id: 'gold-40', name: 'Banquet Set', details: 'Rectangular Set, 40 seats, 1.45m x 11.25m', image: gold40, value: 'White and Beige' },
    styles: [
      { id: 'gold-20', name: 'Banquet Set', details: '20 seats, 1.45m x 5.7m', image: gold20, value: 'White and Beige' },
      { id: 'gold-10', name: 'Banquet Set', details: '10 seats, 1.45m x 3.4m', image: gold10, value: null },
      { id: 'gold-30', name: 'Banquet Set', details: '30 seats, 1.45m x 8.5m', image: gold30, value: 'White and Beige' },
    ],
  },
  {
    id: 'silver',
    base: { id: 'silver-40', name: 'Banquet Set', details: 'Rectangular Set, 40 seats, 1.45m x 11.25m', image: silver40, value: null },
    styles: [
      { id: 'silver-10', name: 'Banquet Set', details: '10 seats, 1.45m x 3.4m', image: silver10, value: null },
      { id: 'silver-20', name: 'Banquet Set', details: '20 seats, 1.45m x 5.7m', image: silver20, value: null },
      { id: 'silver-30', name: 'Banquet Set', details: '30 seats, 1.45m x 8.5m', image: silver30, value: null },
    ],
  },
  {
    id: 'long',
    base: { id: 'long-6', name: 'Banquet Set', details: '6 seats, 2.43m x 61cm', image: long6, value: 'White' },
    styles: [
      { id: 'long-8', name: 'Banquet Set', details: '8 seats, 2.43m x 61cm', image: long8, value: null },
      { id: 'long-0', name: 'Banquet Set', details: '0 seats, 2.43m x 61cm', image: long0, value: null },
    ],
  },
];

export function objectsOf(group: BaseObject) {
  return [group.base, ...group.styles];
}

/** Mirrors _object.html.haml: shared when nothing is set, or when every object has the same value. */
export function sharedState(group: BaseObject) {
  const objects = objectsOf(group);
  const values = objects.map((object) => object.value).filter((value): value is string => value !== null);
  const distinct = [...new Set(values)];
  const shared = values.length === 0 || (values.length === objects.length && distinct.length === 1);
  return { shared, value: shared ? (distinct[0] ?? '') : '', overrides: distinct };
}

export function isComplete(group: BaseObject) {
  return objectsOf(group).every((object) => object.value !== null);
}

export function usedValues() {
  return [...new Set(baseObjects.flatMap((group) => objectsOf(group).map((object) => object.value)))]
    .filter((value): value is string => value !== null)
    .sort();
}
