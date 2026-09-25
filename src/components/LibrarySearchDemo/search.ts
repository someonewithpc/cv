import { concatenatedValues, libraryObjects, type LibraryObject } from './objects';

/* A stand-in for the one MySQL feature the search leans on, MATCH ... AGAINST in boolean
   mode over one FULLTEXT column, so the bars on the sheet are computed rather than drawn.
   It runs at build time for the page's first paint and in the browser as the visitor
   types, over the same mock rows. The SQL is Library::ObjectPropertiesController#search on
   visrez branch hs-1946-arel (Dec 2024). The rewrite follows face962ef,
   the pushed copy of that commit on hs-1946-library-object-tags. The arel branch copy
   has a stray `}` after the closing quote. */

export type Filters = Readonly<{ category?: string; color?: string }>;

export type SearchState = Readonly<{ query: string; filters: Filters }>;

/** One piece of the query after the rewrite: left alone, or one of the gsub's matches. */
export type MangledSegment = { text: string; rule: 'plain' | 'quoted' | 'folded' };

/** Words InnoDB's full-text parser would split on: anything that is not a letter or a digit. */
export function tokenize(text: string) {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** The controller's one rewrite: `gsub(/(\d+)( seats?|pax|size)?/i, '"\1\2"')`. */
export const NUMBER_RULE = /(\d+)( seats?|pax|size)?/gi;

/**
 * The query massaging that runs before MySQL sees anything: a number is quoted so that 8
 * stops matching 81, and a `seats`, `pax` or `size` right after it goes into the same
 * phrase. Words are sent as typed, with no prefix `*`.
 */
export function mangle(raw: string): { text: string; segments: MangledSegment[] } {
  const segments: MangledSegment[] = [];
  let at = 0;
  for (const match of raw.matchAll(NUMBER_RULE)) {
    const [whole, number, unit] = match;
    if (match.index > at) segments.push({ text: raw.slice(at, match.index), rule: 'plain' });
    segments.push({ text: `"${number}${unit ?? ''}"`, rule: unit ? 'folded' : 'quoted' });
    at = match.index + whole.length;
  }
  if (at < raw.length) segments.push({ text: raw.slice(at), rule: 'plain' });
  return { text: raw.replace(NUMBER_RULE, '"$1$2"'), segments };
}

export type Term = {
  /** As it appears in the mangled query. */
  text: string;
  op: '+' | '-' | '';
  /** A bare word matches a token whole; a `*` typed after it matches a prefix. */
  kind: 'word' | 'prefix' | 'phrase';
  words: string[];
};

export function parseTerms(mangled: string): Term[] {
  const pieces = mangled.match(/[+-]?"[^"]*"|\S+/g) ?? [];
  return pieces.flatMap((text): Term[] => {
    const op = (text[0] === '+' || text[0] === '-' ? text[0] : '') as Term['op'];
    const body = op ? text.slice(1) : text;
    const words = tokenize(body);
    if (!words.length) return [];
    if (body.startsWith('"')) return [{ text, op, kind: 'phrase', words }];
    return [{ text, op, kind: body.endsWith('*') ? 'prefix' : 'word', words: [words[0]] }];
  });
}

/** How many times a term occurs in one object's tokens. */
function occurrences(term: Term, tokens: readonly string[]) {
  if (term.kind === 'word') return tokens.filter((token) => token === term.words[0]).length;
  if (term.kind === 'prefix') return tokens.filter((token) => token.startsWith(term.words[0])).length;
  let count = 0;
  for (let i = 0; i + term.words.length <= tokens.length; i += 1) {
    if (term.words.every((word, offset) => tokens[i + offset] === word)) count += 1;
  }
  return count;
}

type Indexed = { object: LibraryObject; tokens: string[] };

const index: readonly Indexed[] = libraryObjects.map((object) => ({
  object,
  tokens: tokenize(concatenatedValues(object)),
}));

export type TermStat = Term & {
  /** Objects in the whole table the term occurs in: InnoDB counts over the index, not over
      the rows a filter leaves. */
  df: number;
  idf: number;
};

export type Hit = {
  object: LibraryObject;
  /** One count per term, in the order of `terms`. */
  tf: number[];
  /** What MATCH ... AGAINST selects: InnoDB's rank, the sum of tf × idf² over the terms. */
  relevance: number;
  /** `search_relevance`: the relevance over the query's maximum; null where the maximum
      is 0, as MySQL's x / 0 is. */
  score: number | null;
};

export type SearchResult = {
  mangled: ReturnType<typeof mangle>;
  terms: TermStat[];
  hits: Hit[];
  max: number | null;
  /** Rows in the table, what the idf is taken against. */
  total: number;
};

export function passesFilters(object: LibraryObject, filters: Filters) {
  return (
    (!filters.category || object.category === filters.category)
    && (!filters.color || object.properties.some(([name, value]) => name === 'color' && value === filters.color))
  );
}

export function search({ query, filters }: SearchState): SearchResult {
  const mangled = mangle(query);
  const parsed = parseTerms(mangled.text);
  const total = index.length;

  const terms: TermStat[] = parsed.map((term) => {
    const df = index.filter(({ tokens }) => occurrences(term, tokens) > 0).length;
    return { ...term, df, idf: df ? Math.log10(total / df) : 0 };
  });

  const required = terms.filter((term) => term.op === '+');
  const optional = terms.filter((term) => term.op === '');

  const hits: Hit[] = [];
  index.forEach(({ object, tokens }) => {
    if (!passesFilters(object, { category: filters.category })) return;
    const tf = terms.map((term) => occurrences(term, tokens));
    const has = (term: TermStat) => tf[terms.indexOf(term)] > 0;

    if (terms.length) {
      // Boolean mode: nothing excluded matches, everything required does, and without a
      // required term at least one of the others has to.
      if (terms.some((term) => term.op === '-' && has(term))) return;
      if (!required.every(has)) return;
      if (!required.length && !optional.some(has)) return;
    }

    const relevance = terms.reduce((sum, term, i) => (term.op === '-' ? sum : sum + tf[i] * term.idf * term.idf), 0);
    hits.push({ object, tf, relevance, score: null });
  });

  // ORDER BY the ratio DESC, then updated_at DESC from the `visible` scope; the mock has
  // no timestamps, so the highest id stands in for the latest update. No terms at all is
  // a plain listing.
  hits.sort((a, b) => b.relevance - a.relevance || b.object.id.localeCompare(a.object.id));

  // The controller takes the maximum before it adds the property filter, so a property
  // narrows the rows but never the maximum they are divided by; the category does both.
  const max = terms.length && hits.length ? Math.max(...hits.map((hit) => hit.relevance)) : null;
  hits.forEach((hit) => {
    hit.score = max ? hit.relevance / max : null;
  });
  const shown = hits.filter((hit) => passesFilters(hit.object, filters));

  return { mangled, terms, hits: shown, max, total };
}

/** The request the search form sends, which is also what in-flight requests are keyed on. */
export function serialise({ query, filters }: SearchState) {
  const form = new URLSearchParams({ query });
  if (filters.category) form.set('category_id', filters.category);
  if (filters.color) {
    form.append('property_name[]', 'color');
    form.append('property_value[]', filters.color);
  }
  return form.toString();
}

export function formatScore(score: number | null) {
  return score === null ? 'NULL' : score.toFixed(2);
}

/* The generated SQL, as segments a page can print and highlight. The match fragment is
   built once and placed three times; `mark` says which of its jobs each copy is doing. */

export type SqlMark = 'where' | 'select' | 'order' | 'max' | 'comment';

export type SqlSegment = { text: string; mark?: SqlMark };

/** MySQL's quoting for a string literal. */
function quote(text: string) {
  return `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

const JOIN = 'FROM `library_objects`\nINNER JOIN `library_object_properties_concatenated` ON `library_object_properties_concatenated`.`library_object_id` = `library_objects`.`id`\n';

/** What `LibraryObject.visible` adds: completed, not deprecated, newest first. */
const VISIBLE = '`library_objects`.`image_processing` = FALSE AND `library_objects`.`deprecated_at` IS NULL\n';

export function sqlSegments({ query, filters }: SearchState): SqlSegment[] {
  const { text } = mangle(query);
  // The controller's query_fragment: sanitize_sql_array with the mangled query bound in.
  const match = `MATCH(\`library_object_properties_concatenated\`.values) AGAINST(${quote(text)} IN BOOLEAN MODE)`;
  const out: SqlSegment[] = [];
  const add = (segment: string, mark?: SqlMark) => out.push({ text: segment, mark });

  const category = filters.category ? `  AND (\`library_objects\`.category = ${quote(filters.category)})\n` : '';
  const property = filters.color
    ? `  AND \`library_objects\`.\`id\` IN (\n    SELECT \`library_object_synthetic_properties\`.\`library_object_id\`\n    FROM \`library_object_synthetic_properties\`\n    WHERE \`library_object_synthetic_properties\`.\`name\` = 'color'\n      AND \`library_object_synthetic_properties\`.\`value\` = ${quote(filters.color)})\n`
    : '';

  if (!text.trim()) {
    add('-- A blank query skips the search: load_objects lists the category, newest first\n', 'comment');
    add(`SELECT \`library_objects\`.*\n${JOIN}WHERE ${VISIBLE}${category}${property}ORDER BY \`library_objects\`.\`updated_at\` DESC`);
    return out;
  }

  // objects_query.reselect("MAX(#{query_fragment})").to_sql: the relation again with the
  // MAX as its only column, so the sanitised fragment is inside it twice more.
  const maxQuery = `SELECT MAX(${match}) ${JOIN}WHERE ${VISIBLE}${category}  AND (${match}) LIMIT 250`.replace(/\n/g, ' ').replace(/ +/g, ' ');

  add('-- eager_load(:space_object, :properties, :styles) adds LEFT OUTER JOINs and their columns, left out here\n', 'comment');
  add('SELECT `library_objects`.*,\n  ((');
  add(match, 'select');
  add(')\n   / (');
  add(maxQuery, 'max');
  add(')) AS search_relevance\n');
  add(JOIN);
  add(`WHERE ${VISIBLE}${category}  AND (`);
  add(match, 'where');
  add(`)\n${property}ORDER BY ((`);
  add(match, 'order');
  add(')\n   / (');
  add('SELECT MAX(...) ... -- the same subquery, in full, again', 'max');
  add(')) DESC,\n  `library_objects`.`updated_at` DESC\nLIMIT 250');
  return out;
}
