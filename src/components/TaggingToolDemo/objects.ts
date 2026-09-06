export type Art = 'chiavari' | 'banquet' | 'stool' | 'trestle';

export type LibraryObject = {
  style: string;
  hue: number;
  value: string | null;
};

export type Group = {
  id: string;
  name: string;
  art: Art;
  autoplay?: boolean;
  objects: readonly LibraryObject[];
};

export const property = 'Finish';

export const autoplayValue = 'Gold Resin';

export const pageCap = { shown: 250, total: 412 };

export const groups: readonly Group[] = [
  {
    id: 'chiavari',
    name: 'Chiavari',
    art: 'chiavari',
    autoplay: true,
    objects: [
      { style: 'Gold', hue: 80, value: null },
      { style: 'Silver', hue: 240, value: null },
      { style: 'Clear', hue: 200, value: null },
      { style: 'Black', hue: 290, value: null },
    ],
  },
  {
    id: 'banquet',
    name: 'Banquet',
    art: 'banquet',
    objects: [
      { style: 'Black', hue: 290, value: 'Black Steel' },
      { style: 'Navy', hue: 250, value: 'Black Steel' },
      { style: 'Walnut', hue: 40, value: 'Walnut' },
    ],
  },
  {
    id: 'stool',
    name: 'Bar Stool',
    art: 'stool',
    objects: [
      { style: 'Chrome', hue: 220, value: 'Chrome' },
      { style: 'Brass', hue: 70, value: 'Chrome' },
    ],
  },
  {
    id: 'trestle',
    name: 'Trestle',
    art: 'trestle',
    objects: [
      { style: 'Pine', hue: 60, value: null },
      { style: 'Oak', hue: 45, value: null },
    ],
  },
];

export function sharedState(group: Group) {
  const values = [...new Set(group.objects.map((object) => object.value ?? ''))];
  return {
    value: values.length === 1 ? values[0] : '',
    mismatched: values.length > 1,
  };
}

export function usedValues() {
  return [...new Set(groups.flatMap((group) => group.objects.map((object) => object.value)))]
    .filter((value): value is string => Boolean(value))
    .sort();
}
