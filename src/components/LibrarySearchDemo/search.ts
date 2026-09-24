import { concatenatedValues, libraryObjects, type LibraryObject } from './objects';

/* A stand-in for the one MySQL feature the search leans on, MATCH ... AGAINST in boolean
   mode over one FULLTEXT column, so the bars on the sheet are computed rather than drawn.
   It runs at build time for the page's first paint and in the browser as the visitor
   types, over the same mock rows. */

export type Filters = Readonly<{ category?: string; color?: string }>;

export type SearchState = Readonly<{ query: string; filters: Filters }>;

/** One whitespace-separated piece of what was typed, what the mangling made of it, and
    which rule did it. */
export type MangledToken = { from: string; to: string; rule: 'prefix' | 'quoted' | 'folded' | 'phrase' };

/** Words InnoDB's full-text parser would split on: anything that is not a letter or a digit. */
export function tokenize(text: string) {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

const FOLDED = /^(seats|pax|size)$/i;

/**
 * The query massaging that runs before MySQL sees anything. A word gets a trailing `*`, so
 * a half-typed word already matches; that is what would let `8` match `81`, so a bare
 * number is wrapped in quotes instead, and a `seats`, `pax` or `size` right after it goes
 * into the same quoted phrase. The boolean operators `+` and `-` are kept in front.
 */
export function mangle(raw: string): { text: string; tokens: MangledToken[] } {
  const pieces = raw.match(/[+-]?"[^"]*"?|\S+/g) ?? [];
  const tokens: MangledToken[] = [];

  for (let i = 0; i < pieces.length; i += 1) {
    const from = pieces[i];
    const [, op = '', body = ''] = /^([+-]?)(.*)$/s.exec(from) ?? [];

    if (body.startsWith('"')) {
      // A phrase typed in quotes stays one; an unclosed one is closed for it.
      const inner = body.replace(/^"|"$/g, '').trim();
      if (inner) tokens.push({ from, to: `${op}"${inner}"`, rule: 'phrase' });
      continue;
    }

    if (/^\d+$/.test(body)) {
      const next = pieces[i + 1];
      if (next !== undefined && FOLDED.test(next)) {
        tokens.push({ from: `${from} ${next}`, to: `${op}"${body} ${next.toLowerCase()}"`, rule: 'folded' });
        i += 1;
      } else {
        tokens.push({ from, to: `${op}"${body}"`, rule: 'quoted' });
      }
      continue;
    }

    const word = body.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
    if (word) tokens.push({ from, to: `${op}${word}*`, rule: 'prefix' });
  }

  return { text: tokens.map((token) => token.to).join(' '), tokens };
}

export type Term = {
  /** As it appears in the mangled query. */
  text: string;
  op: '+' | '-' | '';
  kind: 'prefix' | 'phrase';
  words: string[];
};

export function parseTerms(mangled: string): Term[] {
  const pieces = mangled.match(/[+-]?"[^"]*"|\S+/g) ?? [];
  return pieces.flatMap((text): Term[] => {
    const op = (text[0] === '+' || text[0] === '-' ? text[0] : '') as Term['op'];
    const body = op ? text.slice(1) : text;
    if (body.startsWith('"')) {
      const words = tokenize(body);
      return words.length ? [{ text, op, kind: 'phrase', words }] : [];
    }
    const words = tokenize(body);
    return words.length ? [{ text, op, kind: 'prefix', words: [words[0]] }] : [];
  });
}

/** How many times a term occurs in one object's tokens. */
function occurrences(term: Term, tokens: readonly string[]) {
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
  /** The relevance over the query's maximum; null where the maximum is 0, as MySQL's x / 0 is. */
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
    if (!passesFilters(object, filters)) return;
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

  // ORDER BY the match fragment DESC, then the name; no terms at all is a plain listing.
  hits.sort((a, b) => b.relevance - a.relevance || a.object.name.localeCompare(b.object.name) || a.object.id.localeCompare(b.object.id));

  const max = terms.length && hits.length ? Math.max(...hits.map((hit) => hit.relevance)) : null;
  hits.forEach((hit) => {
    hit.score = max ? hit.relevance / max : null;
  });

  return { mangled, terms, hits, max, total };
}

/** The request the search form would send, which is also what in-flight requests are keyed on. */
export function serialise({ query, filters }: SearchState) {
  const form = new URLSearchParams({ q: query });
  if (filters.category) form.set('category', filters.category);
  if (filters.color) form.set('color', filters.color);
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

export function sqlSegments({ query, filters }: SearchState): SqlSegment[] {
  const { text } = mangle(query);
  const match = `MATCH(lopc.values) AGAINST(${quote(text)} IN BOOLEAN MODE)`;
  const out: SqlSegment[] = [];
  const add = (segment: string, mark?: SqlMark) => out.push({ text: segment, mark });

  const predicates = [
    filters.category ? `library_objects.category = ${quote(filters.category)}` : null,
    filters.color
      ? `library_objects.id IN (\n    SELECT library_object_id FROM library_object_properties\n    WHERE name = 'color' AND value = ${quote(filters.color)})`
      : null,
  ].filter((predicate): predicate is string => predicate !== null);

  if (!text) {
    add('-- Nothing to match: the fragment is left out and the objects are listed by name\n', 'comment');
    add('SELECT library_objects.*\nFROM library_objects\n');
    predicates.forEach((predicate, i) => add(`${i ? '  AND' : 'WHERE'} ${predicate}\n`));
    add('ORDER BY library_objects.name');
    return out;
  }

  add('SELECT library_objects.*,\n       ');
  add(match, 'select');
  add(' AS relevance,\n       ');
  add('(SELECT MAX(copy.relevance) FROM (/* this relation, re-selected */) AS copy)', 'max');
  add(' AS max_relevance\nFROM library_objects\nJOIN library_object_properties_concatenated lopc\n  ON lopc.library_object_id = library_objects.id\nWHERE ');
  add(match, 'where');
  add('\n');
  predicates.forEach((predicate) => add(`  AND ${predicate}\n`));
  add('ORDER BY ');
  add(match, 'order');
  add(' DESC,\n         library_objects.name');
  return out;
}
