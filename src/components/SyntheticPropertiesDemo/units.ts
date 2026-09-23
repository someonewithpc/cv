/**
 * The unit maths behind the synthetic properties, shared by the sheets (rendered at build
 * time) and the live layer's script, so both print the same numbers.
 *
 * A library object stores its size as one string of centimetres, `160x80x74`. The product
 * splits it with a recursive CTE, renders every dimension six ways and GROUP_CONCATs each
 * rendering back together with ' by '. The original SQL was not to hand when this was
 * written, so the rounding below is a stated rule rather than a port:
 *
 * - centimetres: rounded to the whole centimetre, `160cm`
 * - metres: centimetres over 100, rounded to two places, trailing zeros dropped, `1.6m`
 * - in" and inches: centimetres over 2.54, rounded to the whole inch, `63"` and `63in`
 * - ft'in" and feet-inches: whole feet, then the remainder rounded to the whole inch, and
 *   a remainder that rounds up to 12 carries into the feet, `5'3"` and `5ft3in`
 *
 * The carry is the one place a naive port goes wrong: 182.5cm is 71.85in, so the feet
 * come out at 5 and the remainder at 11.85, which rounds to 12. Without the carry that
 * prints 5'12" where the answer is 6'0".
 */

export const CM_PER_INCH = 2.54;
export const INCHES_PER_FOOT = 12;

/** The six renderings in the order the product union-alls them. `short` is the column
    header a narrow sheet has room for. */
export const renderings = [
  { id: 'cm', name: 'Size (centimeters)', short: 'cm' },
  { id: 'm', name: 'Size (meters)', short: 'm' },
  { id: 'in-mark', name: 'Size (in")', short: 'in"' },
  { id: 'in', name: 'Size (inches)', short: 'inches' },
  { id: 'ft-mark', name: `Size (ft'in")`, short: `ft'in"` },
  { id: 'ft-in', name: 'Size (feet-inches)', short: 'feet-inches' },
] as const;

export type RenderingId = (typeof renderings)[number]['id'];

/** The three a sheet shows before hover or focus asks for the rest. */
export const primaryRenderings: readonly RenderingId[] = ['cm', 'm', 'ft-in'];

/** The two names a seat count is stored under, so either word finds it. */
export const paxAliases = ['Pax', 'Seats'] as const;

export type Dimension = {
  /** The piece of the string as the split left it, trimmed. */
  raw: string;
  /** Centimetres, or null for a piece that is not a number and renders nothing. */
  cm: number | null;
};

/** What the recursive CTE does: SUBSTRING_INDEX takes the head up to the first `x`, the
    remainder recurses, one row per piece. MySQL's default collation matches `X` too. */
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

/** Round half away from zero, which is what MySQL's ROUND does on an exact decimal; plain
    Math.round goes the other way on negatives, and a size is never negative, but this
    keeps the rule written down in one place. */
function round(value: number, places = 0) {
  const scale = 10 ** places;
  // The epsilon keeps a value like 1.005 from printing as 1.00 on binary floats.
  return (Math.sign(value) * Math.round(Math.abs(value) * scale + 1e-9)) / scale;
}

/** A number the way the SQL's trailing-zero trim prints it: no `.0`, no `1.50`. */
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
      return `${trim(round(cm))}cm`;
    case 'm':
      return `${trim(round(cm / 100, 2))}m`;
    case 'in-mark':
      return `${trim(round(cm / CM_PER_INCH))}"`;
    case 'in':
      return `${trim(round(cm / CM_PER_INCH))}in`;
    case 'ft-mark': {
      const { feet, inches } = feetAndInches(cm);
      return `${feet}'${inches}"`;
    }
    case 'ft-in': {
      const { feet, inches } = feetAndInches(cm);
      return `${feet}ft${inches}in`;
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

/** The seat count under both of its names. */
export function paxProperties(pax: string): SyntheticProperty[] {
  const count = pax.trim();
  if (!/^\d+$/.test(count)) return [];
  return paxAliases.map((alias) => {
    const value = `${Number(count)} ${alias}`;
    return { name: alias, value, pieces: [value] };
  });
}

/** The trigger on the synthetic table re-concatenates every row of the touched object
    into the one searchable column: name and value per row, a row per line. */
export function searchableText(properties: readonly SyntheticProperty[]) {
  return properties.map(({ name, value }) => `${name}: ${value}`).join('\n');
}

/** A stand-in for SH-04's FULLTEXT match, so the sheet can say which queries hit: the
    query as a phrase, case-insensitive, bounded by whitespace or the ends of a line so
    `3"` does not hit inside `5'3"`. */
export function matches(text: string, query: string) {
  const phrase = query.trim().replace(/\s+/g, ' ');
  if (phrase === '') return false;
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
  return new RegExp(`(?<!\\S)${escaped}(?!\\S)`, 'i').test(text);
}

/** What the live layer opens on, and the queries it tries against it. */
export const sample = { size: '160x80x74', pax: '8' };

export const sampleQueries = ['5ft3in', '1.6m', '63"', '8 seats', '2m'] as const;

/** What the walkthrough types in turn: a size, then a query that finds it. The sample
    first, then a round two metres, then one whose feet and inches carry. */
export const walkthrough = [
  { size: '160x80x74', query: '5ft3in' },
  { size: '200x100x75', query: '2m' },
  { size: '182.5x45', query: '6ft0in' },
] as const;
