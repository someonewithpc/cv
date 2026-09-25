/**
 * The unit maths behind the synthetic properties, shared by the sheets (rendered at build
 * time) and the live layer's script, so both print the same numbers.
 *
 * A port of LibraryObject.size_synthetic_property_select_sql, visrez branch
 * hs-1946-library-object-tags (Dec 2024). A library object stores its size as one string
 * of centimetres, `160x80x74`. A recursive CTE splits it, six SELECTs render every piece,
 * and GROUP_CONCAT joins each rendering's pieces back with ' by '. Three rules are
 * corrections, not a port, and the sheets show the SQL with them in:
 *
 * - Shipped cm and m did not round: 182.5 printed as `182.5cm` and `1.825m`. Here a
 *   size rounds to two significant figures, `180cm` and `1.8m`; 74 stays `74cm` and
 *   `0.74m`.
 * - Shipped feet added a foot whenever the leftover inches came to six or more, so 80cm
 *   printed as `3ft7in`. Here only a rest that rounds to twelve carries: `2ft7in`.
 * - Shipped feet always printed the inches, `6ft0in`. Here a whole number of feet prints
 *   alone, `6ft` and `6'`.
 *
 * Inches were right as shipped: centimetres over 2.54, rounded to the whole inch.
 */

export const CM_PER_INCH = 2.54;
export const INCHES_PER_FOOT = 12;

/** The six renderings in the order the product union-alls them, under the names the
    product stores them as: the two inch rows share a name, and so do the two feet rows.
    `short` is the column header a narrow sheet has room for. */
export const renderings = [
  { id: 'cm', name: 'Size (centimeters)', short: 'cm' },
  { id: 'm', name: 'Size (meters)', short: 'm' },
  { id: 'in-mark', name: 'Size (inches)', short: 'in"' },
  { id: 'in', name: 'Size (inches)', short: 'in' },
  { id: 'ft-mark', name: 'Size (feet-inches)', short: `ft'in"` },
  { id: 'ft-in', name: 'Size (feet-inches)', short: 'ft in' },
] as const;

export type RenderingId = (typeof renderings)[number]['id'];

/** The two names a seat count is stored under, so either word finds it. */
export const paxAliases = ['Pax', 'Seats'] as const;

export type Dimension = {
  /** The piece of the string as the split left it, trimmed. */
  raw: string;
  /** Centimetres, or null for a piece that is not a number and renders nothing. */
  cm: number | null;
};

/** What the recursive CTE does: SUBSTRING_INDEX takes the head up to the first `x`, the
    remainder recurses, one row per piece. MariaDB's default collation matches `X` too. */
export function splitSizes(size: string): Dimension[] {
  const pieces: string[] = [];
  let rest = size;
  while (rest.length > 0) {
    const at = rest.search(/x/i);
    if (at < 0) {
      pieces.push(rest);
      break;
    }
    pieces.push(rest.slice(0, at));
    rest = rest.slice(at + 1);
  }
  return pieces
    .map((piece) => piece.trim())
    .filter((piece) => piece !== '')
    .map((raw) => {
      const value = /^\d+(\.\d+)?$/.test(raw) ? Number(raw) : NaN;
      return { raw, cm: Number.isFinite(value) ? value : null };
    });
}

/** MariaDB's ROUND(x, places): half away from zero, and a negative `places` rounds to tens
    and hundreds the way ROUND(182, -1) gives 180. */
function round(value: number, places = 0) {
  const scale = 10 ** places;
  // The epsilon keeps a value like 1.005 from printing as 1.00 on binary floats.
  return (Math.sign(value) * Math.round(Math.abs(value) * scale + 1e-9)) / scale;
}

/** Two significant figures, ROUND(x, 1 - FLOOR(LOG10(x))) in SQL: 182 is 180 and 1.82 is
    1.8, while 74 and 0.74 stay as they are. */
function twoFigures(value: number) {
  if (value === 0) return 0;
  return round(value, 1 - Math.floor(Math.log10(value)));
}

/** A number the way CONCAT prints a DOUBLE: no `.0`, no `1.50`. */
function trim(value: number) {
  return String(Number(value.toFixed(2)));
}

/** Whole feet and the inches left over, with the carry. */
export function feetAndInches(cm: number) {
  const inches = cm / CM_PER_INCH;
  let feet = Math.floor(inches / INCHES_PER_FOOT);
  let rest = round(inches - feet * INCHES_PER_FOOT);
  if (rest === INCHES_PER_FOOT) {
    feet += 1;
    rest = 0;
  }
  return { feet, inches: rest };
}

/** One dimension in one unit. */
export function renderDimension(cm: number, unit: RenderingId): string {
  switch (unit) {
    case 'cm':
      return `${trim(twoFigures(cm))}cm`;
    case 'm':
      return `${trim(twoFigures(cm / 100))}m`;
    case 'in-mark':
      return `${trim(round(cm / CM_PER_INCH))}"`;
    case 'in':
      return `${trim(round(cm / CM_PER_INCH))}in`;
    case 'ft-mark': {
      const { feet, inches } = feetAndInches(cm);
      return inches === 0 ? `${feet}'` : `${feet}'${inches}"`;
    }
    case 'ft-in': {
      const { feet, inches } = feetAndInches(cm);
      return inches === 0 ? `${feet}ft` : `${feet}ft${inches}in`;
    }
  }
}

export type SyntheticProperty = { name: string; value: string; pieces: readonly string[] };

/** The six size rows for one object: each rendering of every dimension, joined with
    GROUP_CONCAT(... SEPARATOR ' by '). No numeric dimension, no rows. */
export function sizeProperties(size: string): SyntheticProperty[] {
  const dimensions = splitSizes(size).filter((dimension) => dimension.cm !== null);
  if (dimensions.length === 0) return [];
  return renderings.map(({ id, name }) => {
    const pieces = dimensions.map((dimension) => renderDimension(dimension.cm!, id));
    return { name, value: pieces.join(' by '), pieces };
  });
}

/** A number as it was stored, the way CONCAT prints it: `182`, `182.5`, `1.825`. */
function exact(value: number) {
  return String(Number(value.toPrecision(12)));
}

/** The size rows the synthetic table holds: the six renderings, and next to the rounded
    centimetres and metres the exact ones, wherever rounding moved a dimension. A 182cm
    table reads 180cm and 1.8m, and a search for 182cm or 1.82m still finds it. */
export function storedSizeProperties(size: string): SyntheticProperty[] {
  const dimensions = splitSizes(size).filter((dimension) => dimension.cm !== null);
  return sizeProperties(size).flatMap((row, index) => {
    const unit = renderings[index].id;
    if (unit !== 'cm' && unit !== 'm') return [row];
    const pieces = dimensions.map(({ cm }) => (unit === 'cm' ? `${exact(cm!)}cm` : `${exact(cm! / 100)}m`));
    if (pieces.every((piece, at) => piece === row.pieces[at])) return [row];
    return [row, { name: row.name, value: pieces.join(' by '), pieces }];
  });
}

/** The seat count under both of its names. The value is the bare count; the name is what
    makes it read as `8 Pax` and `8 Seats` once the two are concatenated. */
export function paxProperties(pax: string): SyntheticProperty[] {
  const count = pax.trim();
  if (!/^\d+$/.test(count)) return [];
  const value = String(Number(count));
  return paxAliases.map((alias) => ({ name: alias, value, pieces: [value] }));
}

/** The trigger on the synthetic table concatenates every row of the touched object into
    the one searchable column, GROUP_CONCAT(CONCAT(value, ' ', name) SEPARATOR ' '): value
    then name, one space between everything. */
export function searchableText(properties: readonly SyntheticProperty[]) {
  return properties.map(({ name, value }) => `${value} ${name}`).join(' ');
}

/** A stand-in for SH-04's FULLTEXT match, so the sheet can say whether the search hits: the
    query as a phrase, case-insensitive, bounded by whitespace or the ends of the text so
    `3"` does not hit inside `5'3"`. */
export function matches(text: string, query: string) {
  const phrase = query.trim().replace(/\s+/g, ' ');
  if (phrase === '') return false;
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
  return new RegExp(`(?<!\\S)${escaped}(?!\\S)`, 'i').test(text);
}

/** What the live layer opens on. */
export const sample = { size: '160x80x74', pax: '8' };

/** What the walkthrough types in turn: a size, then a query that finds it. The sample
    first, then a round two metres, then one that rounds to 180cm and whose feet and
    inches carry. */
export const walkthrough = [
  { size: '160x80x74', query: '5ft3in' },
  { size: '200x100x75', query: '2m' },
  { size: '182x45', query: '6ft' },
] as const;
