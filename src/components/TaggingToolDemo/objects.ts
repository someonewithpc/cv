import gold12 from './thumbs/10629.png?url';
import gold11 from './thumbs/10630.png?url';
import gold10 from './thumbs/10631.png?url';
import gold0 from './thumbs/10638.png?url';
import wood10 from './thumbs/11150.png?url';
import wood9 from './thumbs/11152.png?url';
import wood0 from './thumbs/11164.png?url';
import woodShort10 from './thumbs/11439.png?url';

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

/** The Banquet category's two schemas that are stored as properties (pax and size are
    columns of the object). Names are stored lowercase and shown titleized, as
    index.html.haml does. */
export const properties: readonly Property[] = [
  { id: 'chair', name: 'Chair' },
  { id: 'table color', name: 'Table Color' },
];

export const defaultProperty = properties[0].id;

/** The walkthrough's script: one shared value over a group whose objects disagree, then
    one object set on its own card. Each step moves the row towards what the product
    holds for it. */
export const walkthrough = {
  value: 'Ivory',
  /** What the own-card step saves; null empties the field, which is how the product
      stores nil. */
  overrideValue: null as string | null,
  /** Which object of the auto-played row gets the own-card step: the bare table, whose
      chair value goes back to none. */
  overrideIndex: 3,
};

/* Rows of the Banquet category as the product stores them (library_objects 10629 and
   11150 with their styles, properties for schemas 11 "table color" and 12 "chair"),
   thumbnails from the same rows. Each group runs to sixteen styles in the product; the
   sheet shows the base and three, chosen so the row still has the disagreement and the
   gap the page is about. Three chair values on the gold row are the walkthrough's wrong
   starting point, marked below; its steps end on the product's values. */
export const baseObjects: readonly BaseObject[] = [
  {
    id: 'gold',
    autoplay: true,
    // The walkthrough's wrong starting point, not the product's row: the product holds
    // chair "Beige" on 10629, the shared save overwrites it with "Ivory" like the rest.
    base: {
      id: '10629',
      name: 'Banquet Set',
      details: '12 seats, 1.82m',
      image: gold12,
      values: { chair: 'Ivory', 'table color': 'White and Beige' },
    },
    variants: [
      // The walkthrough's wrong starting point, not the product's row: the product holds
      // chair "Ivory" on 10630, the shared save puts it back.
      {
        id: '10630',
        name: 'Banquet Set',
        details: '11 seats, 1.82m',
        image: gold11,
        values: { chair: 'Beige', 'table color': 'White and Beige' },
      },
      {
        id: '10631',
        name: 'Banquet Set',
        details: '10 seats, 1.82m',
        image: gold10,
        values: { chair: 'Ivory', 'table color': 'White and Beige' },
      },
      // Also a wrong starting point: the product holds chair nil on 10638, the table
      // without chairs. The walkthrough's last step empties it again.
      {
        id: '10638',
        name: 'Banquet Set',
        details: '0 seats, 1.82m',
        image: gold0,
        values: { chair: 'Champagne', 'table color': 'White and Beige' },
      },
    ],
  },
  {
    id: 'wood',
    base: {
      id: '11150',
      name: 'Banquet Set',
      details: '10 seats, 1.82m',
      image: wood10,
      values: { chair: 'Cream', 'table color': 'wood' },
    },
    variants: [
      {
        id: '11152',
        name: 'Banquet Set',
        details: '9 seats, 1.82m',
        image: wood9,
        values: { chair: 'Cream', 'table color': 'Wood' },
      },
      {
        id: '11164',
        name: 'Banquet Set',
        details: '0 seats, 1.52m',
        image: wood0,
        values: { chair: null, 'table color': 'Wood' },
      },
      {
        id: '11439',
        name: 'Banquet Set',
        details: '10 seats, 1.52m',
        image: woodShort10,
        values: { chair: null, 'table color': null },
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

/** A row with every object set but still disagreeing still needs the shared editor;
    the walkthrough's own start state (all four gold cards set, three chair values
    between them) would otherwise read as done and leave the list before it opens. */
export function isComplete(group: BaseObject, property: string) {
  const stored = objectsOf(group).map((object) => object.values[property] ?? null);
  return stored.every((value) => value !== null) && new Set(stored).size === 1;
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
