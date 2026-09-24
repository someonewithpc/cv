/**
 * A web-ts-mode buffer, captured once at build time. Nothing here parses with tree-sitter:
 * the page must never run a parser, and the build has no grammars to run one with. This is
 * a small lexer that paints the faces web-ts-mode's font-lock rules would give each token
 * (web-ts-hosts/astro.el, web-ts-treesit.el, and the stock typescript-ts-mode rules they
 * prefix) and cuts the buffer into the ranges its `treesit-range-rules` would hand to
 * each embedded parser. The result is plain data for the layers to render.
 *
 * It was checked once against the real grammars (tree-sitter-astro, tsx, and the SCSS
 * grammar web-ts-mode vendors): the ranges on these sheets, and every selector depth in
 * them, come out the same.
 */

export type Lang = 'astro' | 'tsx' | 'scss' | 'css';

/** The face a character ends up with, by the Emacs face it stands for. */
export type Face =
  | 'default'
  | 'comment' // font-lock-comment-face, and the frontmatter fences
  | 'keyword' // font-lock-keyword-face; web-ts-css-property-face inherits it
  | 'builtin' // font-lock-builtin-face: SCSS at-keywords and !important
  | 'string'
  | 'type'
  | 'function' // font-lock-function-name-face and the call face that inherits it
  | 'variable' // font-lock-variable-name-face; property and CSS value faces inherit it
  | 'constant' // font-lock-constant-face: markup attribute names
  | 'tag' // web-ts-tag-face: known HTML/SVG tags
  | 'component' // web-ts-component-tag-face: PascalCase, dotted or hyphenated tags
  | 'literal' // web-ts-literal-tag-face: unknown lowercase tags, which Astro allows
  | 'bracket'
  | 'delimiter'
  | 'selector'; // a depth face from web-ts-treesit--css-selector-face-for-depth

export type Range = {
  id: string;
  lang: Lang;
  /** The node the range rule captures, as the grammar names it. */
  node: string;
  /** What the echo area says about the rule that made the range. */
  rule: string;
  offset: boolean;
  start: number;
  end: number;
};

export type Token = {
  text: string;
  face: Face;
  /** Selector nesting level, for the selector face only. */
  depth: number | null;
  /** Id of the range whose parser owns the token; `host` for the Astro parser itself. */
  range: string;
};

export type Line = { number: number; tokens: Token[] };

export type Capture = { lines: Line[]; ranges: Range[] };

type Paint = {
  src: string;
  faces: Face[];
  depths: (number | null)[];
  owner: string[];
};

function paint(p: Paint, start: number, end: number, face: Face) {
  for (let i = start; i < end; i += 1) p.faces[i] = face;
}

const isIdentStart = (ch: string | undefined) => !!ch && /[A-Za-z_$]/.test(ch);
const isIdent = (ch: string | undefined) => !!ch && /[\w$]/.test(ch);
const isSpace = (ch: string | undefined) => !!ch && /\s/.test(ch);

function skipString(src: string, i: number): number {
  const quote = src[i];
  let j = i + 1;
  while (j < src.length && src[j] !== quote) {
    if (src[j] === '\\') j += 1;
    j += 1;
  }
  return Math.min(j + 1, src.length);
}

/** The index of the brace that closes the one at `open`, skipping strings and comments. */
function matchBrace(src: string, open: number, end = src.length): number {
  let depth = 0;
  for (let i = open; i < end; i += 1) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      i = skipString(src, i) - 1;
    } else if (src.startsWith('/*', i)) {
      i = src.indexOf('*/', i + 2) + 1 || end;
    } else if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return end;
}

// ----------------------------------------------------------------------------------------
// Markup tags: web-ts-treesit--tag-face-for-name

const HTML_TAGS = new Set(
  (
    'a abbr address area article aside audio b base bdi bdo blockquote body br button canvas caption cite code col ' +
    'colgroup data datalist dd del details dfn dialog div dl dt em embed fieldset figcaption figure footer form ' +
    'h1 h2 h3 h4 h5 h6 head header hgroup hr html i iframe img input ins kbd label legend li link main map mark ' +
    'menu meta meter nav noscript object ol optgroup option output p picture pre progress q rp rt ruby s samp ' +
    'script search section select slot small source span strong style sub summary sup table tbody td template ' +
    'textarea tfoot th thead time title tr track u ul var video wbr ' +
    'svg path g circle rect line polyline polygon ellipse text tspan use defs clippath mask pattern ' +
    'lineargradient radialgradient stop symbol view foreignobject image marker animate animatetransform desc'
  ).split(' '),
);

const VOID_TAGS = new Set('area base br col embed hr img input link meta source track wbr'.split(' '));

function tagFace(name: string): Face {
  if (/^[A-Z]/.test(name) || name.includes('.') || name.includes('-')) return 'component';
  return HTML_TAGS.has(name.toLowerCase()) ? 'tag' : 'literal';
}

// ----------------------------------------------------------------------------------------
// TSX: the typescript-ts-mode features the Astro host enables (no tsx-operator, no
// tsx-variable), so operators and plain identifiers stay in the default face.

const TS_KEYWORDS = new Set(
  (
    'as async await break case catch class const continue debugger default delete do else enum export extends ' +
    'finally for from function if implements import in instanceof interface keyof let new of readonly return ' +
    'satisfies static switch this throw try type typeof var void while yield'
  ).split(' '),
);
const TS_CONSTANTS = new Set(['true', 'false', 'null', 'undefined']);
const TS_TYPES = new Set('any bigint boolean never number object string symbol unknown void'.split(' '));
const EXPRESSION_BEFORE = new Set(['(', '{', '[', ',', '=', '=>', '&&', '||', '??', '?', ':', 'return', '']);

type BraceKind = 'type' | 'pattern' | 'object' | 'block';

function lexTsx(p: Paint, start: number, end: number, topLevel = false) {
  const { src } = p;
  const braces: BraceKind[] = [];
  let typeMode = 0; // > 0 while inside a type expression (after `type X =` or a `:` annotation)
  let prev = ''; // the last significant token
  let declaring = false; // just after const/let/var

  const inType = () => typeMode > 0 || braces.at(-1) === 'type';
  const nextSignificant = (from: number) => {
    let j = from;
    while (j < end && isSpace(src[j])) j += 1;
    return j;
  };

  let i = start;
  while (i < end) {
    const ch = src[i];

    if (isSpace(ch)) {
      i += 1;
      continue;
    }

    if (src.startsWith('//', i)) {
      const stop = src.indexOf('\n', i);
      const e = stop < 0 || stop > end ? end : stop;
      paint(p, i, e, 'comment');
      i = e;
      continue;
    }
    if (src.startsWith('/*', i)) {
      const e = Math.min(src.indexOf('*/', i + 2) + 2 || end, end);
      paint(p, i, e, 'comment');
      i = e;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      const e = Math.min(skipString(src, i), end);
      paint(p, i, e, 'string');
      prev = 'string';
      i = e;
      continue;
    }

    // JSX, where an expression can start.
    if (ch === '<' && (isIdentStart(src[i + 1]) || src[i + 1] === '>') && EXPRESSION_BEFORE.has(prev) && !inType()) {
      i = lexJsx(p, i, end);
      prev = 'jsx';
      continue;
    }

    if (/\d/.test(ch)) {
      let e = i;
      while (e < end && /[\w.]/.test(src[e])) e += 1;
      prev = 'number';
      i = e;
      continue;
    }

    if (isIdentStart(ch)) {
      let e = i;
      while (e < end && isIdent(src[e])) e += 1;
      const word = src.slice(i, e);
      const after = nextSignificant(e);
      const member = prev === '.';

      let face: Face = 'default';
      if (member) {
        face = src[after] === '(' ? 'function' : 'variable'; // property-use / call face
      } else if (TS_KEYWORDS.has(word) && !(inType() && TS_TYPES.has(word))) {
        face = 'keyword';
      } else if (TS_CONSTANTS.has(word)) {
        face = 'constant';
      } else if (prev === 'type' || prev === 'interface') {
        face = 'type';
      } else if (inType()) {
        const signature = braces.at(-1) === 'type' && (src[after] === ':' || src.startsWith('?:', after));
        face = signature ? 'variable' : TS_TYPES.has(word) || /^[A-Z]/.test(word) ? 'type' : 'default';
      } else if (braces.at(-1) === 'pattern') {
        face = 'variable'; // shorthand_property_identifier_pattern
      } else if (braces.at(-1) === 'object' && src[after] === ':') {
        face = 'variable'; // pair key: property-use face
      } else if (declaring) {
        face = 'variable'; // variable_declarator name
      } else if (src[after] === '(') {
        face = 'function';
      }
      paint(p, i, e, face);

      if (word === 'const' || word === 'let' || word === 'var') declaring = true;
      else if (!member) declaring = false;
      prev = TS_KEYWORDS.has(word) ? word : 'ident';
      i = e;
      continue;
    }

    // Punctuation.
    const two = src.slice(i, i + 2);
    const op = ['=>', '&&', '||', '??', '?.'].includes(two) ? two : ch;

    if (op === '{') {
      // What a brace opens decides how the names inside it are painted.
      let kind: BraceKind = 'block';
      if (inType()) kind = 'type';
      else if (declaring) kind = 'pattern';
      else if (EXPRESSION_BEFORE.has(prev) && prev !== '{') kind = prev === '' && topLevel ? 'block' : 'object';
      braces.push(kind);
      if (kind === 'type') typeMode = 0;
      paint(p, i, i + 1, 'bracket');
      declaring = false;
    } else if (op === '}') {
      braces.pop();
      paint(p, i, i + 1, 'bracket');
    } else if ('()[]'.includes(op)) {
      paint(p, i, i + 1, 'bracket');
    } else if (',.;:'.includes(op)) {
      paint(p, i, i + 1, 'delimiter');
      // A `:` outside an object or a type literal starts an annotation.
      if (op === ':' && braces.at(-1) !== 'object' && braces.at(-1) !== 'type') typeMode = 1;
      if (op === ';' || (op === ',' && braces.at(-1) !== 'type')) typeMode = 0;
    } else if (op === '=' && braces.at(-1) === 'pattern') {
      // A default value inside a pattern is an expression of its own.
      const stop = findPatternValueEnd(src, i + 1, end);
      lexTsx(p, i + 1, stop);
      i = stop;
      prev = 'ident';
      continue;
    } else if (op === '=') {
      // `type Props =`: what follows is a type until the statement ends.
      typeMode = isTypeAlias(src, start, i) ? 1 : 0;
      declaring = false;
    }

    prev = op;
    i += op.length;
  }
}

function isTypeAlias(src: string, start: number, at: number): boolean {
  const before = src.slice(start, at);
  return /(?:^|[\s;])type\s+[A-Za-z_$][\w$]*(?:<[^>]*>)?\s*$/.test(before);
}

function findPatternValueEnd(src: string, from: number, end: number): number {
  let depth = 0;
  for (let j = from; j < end; j += 1) {
    const ch = src[j];
    if (ch === '"' || ch === "'" || ch === '`') j = skipString(src, j) - 1;
    else if ('([{'.includes(ch)) depth += 1;
    else if (')]'.includes(ch)) depth -= 1;
    else if (ch === '}') {
      if (depth === 0) return j;
      depth -= 1;
    } else if (ch === ',' && depth === 0) return j;
  }
  return end;
}

/** One JSX element from `<` to its close; returns the index after it. */
function lexJsx(p: Paint, open: number, end: number): number {
  const { src } = p;
  let i = open;
  let depth = 0;

  while (i < end) {
    if (src[i] === '<') {
      const closing = src[i + 1] === '/';
      const nameStart = i + (closing ? 2 : 1);
      paint(p, i, nameStart, 'bracket');
      let e = nameStart;
      while (e < end && /[\w.:-]/.test(src[e])) e += 1;
      const name = src.slice(nameStart, e);
      if (name) paint(p, nameStart, e, tagFace(name));
      i = e;

      // Attributes up to the tag's end.
      let selfClosing = false;
      while (i < end && src[i] !== '>') {
        if (src.startsWith('/>', i)) {
          paint(p, i, i + 2, 'bracket');
          i += 2;
          selfClosing = true;
          break;
        }
        if (isIdentStart(src[i])) {
          let a = i;
          while (a < end && /[\w:-]/.test(src[a])) a += 1;
          paint(p, i, a, 'constant');
          i = a;
        } else if (src[i] === '"' || src[i] === "'") {
          const s = skipString(src, i);
          paint(p, i, s, 'string');
          i = s;
        } else if (src[i] === '{') {
          const close = matchBrace(src, i, end);
          paint(p, i, i + 1, 'bracket');
          paint(p, close, close + 1, 'bracket');
          lexTsx(p, i + 1, close);
          i = close + 1;
        } else {
          i += 1;
        }
      }
      if (!selfClosing && src[i] === '>') {
        paint(p, i, i + 1, 'bracket');
        i += 1;
        const isVoid = VOID_TAGS.has(name);
        if (closing) depth -= 1;
        else if (!isVoid) depth += 1;
      }
      if (depth <= 0) return i;
      continue;
    }

    if (src[i] === '{') {
      const close = matchBrace(src, i, end);
      paint(p, i, i + 1, 'bracket');
      paint(p, close, close + 1, 'bracket');
      lexTsx(p, i + 1, close);
      i = close + 1;
      continue;
    }

    i += 1;
  }
  return i;
}

// ----------------------------------------------------------------------------------------
// Selector depth: web-ts-treesit--fontify-selector-node, over the shapes the SCSS grammar
// gives a selector. Combinator chains keep deepening left to right (each step starts one
// past the deepest level the left side reached); a functional pseudo-class paints itself
// at its own depth and its arguments one deeper; comma branches share a depth. Every rule
// starts again at 0: nesting in the stylesheet does not add to it.

function splitTop(text: string, sep: string): [number, number][] {
  const parts: [number, number][] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"' || ch === "'") i = skipString(text, i) - 1;
    else if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth -= 1;
    else if (ch === sep && depth === 0) {
      parts.push([from, i]);
      from = i + 1;
    }
  }
  parts.push([from, text.length]);
  return parts;
}

function trimRange(text: string, [s, e]: [number, number]): [number, number] {
  while (s < e && isSpace(text[s])) s += 1;
  while (e > s && isSpace(text[e - 1])) e -= 1;
  return [s, e];
}

function paintDepth(depths: (number | null)[], base: number, s: number, e: number, depth: number) {
  for (let i = s; i < e; i += 1) depths[base + i] = depth;
}

/** Paints a comma list of selectors in `text[s, e)` at `depth`; returns the deepest level used. */
export function paintSelectorList(
  text: string,
  s: number,
  e: number,
  depth: number,
  depths: (number | null)[],
  base = 0,
): number {
  let max = depth;
  for (const [ps, pe] of splitTop(text.slice(s, e), ',')) {
    const [cs, ce] = trimRange(text, [s + ps, s + pe]);
    if (cs < ce) max = Math.max(max, paintComplex(text, cs, ce, depth, depths, base));
  }
  return max;
}

function paintComplex(text: string, s: number, e: number, depth: number, depths: (number | null)[], base: number): number {
  // The grammar wraps a whole chain that ends in a pseudo-element (`ul li::before`) in one
  // pseudo_element_selector node, which the walker paints as a single leaf.
  let paren = 0;
  for (let i = s; i < e - 1; i += 1) {
    if (text[i] === '(') paren += 1;
    else if (text[i] === ')') paren -= 1;
    else if (paren === 0 && text[i] === ':' && text[i + 1] === ':') {
      paintDepth(depths, base, s, e, depth);
      return depth;
    }
  }

  // Compounds and the combinators between them, at the top level.
  const compounds: [number, number][] = [];
  let leading = false;
  let i = s;
  paren = 0;
  let from = -1;
  while (i <= e) {
    const ch = i < e ? text[i] : ' ';
    if (ch === '(' || ch === '[') paren += 1;
    if (ch === ')' || ch === ']') paren -= 1;
    const boundary = paren === 0 && (isSpace(ch) || ch === '>' || ch === '+' || ch === '~');
    if (boundary) {
      if (from >= 0) {
        compounds.push([from, i]);
        from = -1;
      } else if (compounds.length === 0 && ch !== ' ' && !isSpace(ch)) {
        leading = true;
      }
    } else if (from < 0) {
      from = i;
    }
    i += 1;
  }

  let max = leading ? depth : depth - 1;
  for (const [cs, ce] of compounds) {
    max = paintCompound(text, cs, ce, max + 1, depths, base);
  }
  return Math.max(depth, max);
}

function paintCompound(text: string, s: number, e: number, depth: number, depths: (number | null)[], base: number): number {
  paintDepth(depths, base, s, e, depth);
  if (text[e - 1] !== ')') return depth;

  // The last functional pseudo-class, whose arguments run to the end of the compound.
  let paren = 0;
  for (let i = e - 1; i >= s; i -= 1) {
    if (text[i] === ')') paren += 1;
    else if (text[i] === '(') {
      paren -= 1;
      if (paren === 0) {
        return Math.max(depth, paintSelectorList(text, i + 1, e - 1, depth + 1, depths, base));
      }
    }
  }
  return depth;
}

// ----------------------------------------------------------------------------------------
// SCSS / CSS

function lexValues(p: Paint, s: number, e: number) {
  const { src } = p;
  let i = s;
  while (i < e) {
    const ch = src[i];
    if (isSpace(ch) || ch === ',' || ch === ':' || ch === ';' || ch === '/' || ch === '*' || ch === '+') {
      i += 1;
    } else if (src.startsWith('/*', i)) {
      const c = Math.min(src.indexOf('*/', i + 2) + 2 || e, e);
      paint(p, i, c, 'comment');
      i = c;
    } else if (ch === '"' || ch === "'") {
      const c = Math.min(skipString(src, i), e);
      paint(p, i, c, 'string');
      i = c;
    } else if ('()[]'.includes(ch)) {
      paint(p, i, i + 1, 'bracket');
      i += 1;
    } else if (src.startsWith('!important', i)) {
      paint(p, i, i + 10, 'builtin');
      i += 10;
    } else if (src.startsWith('#{', i)) {
      const c = matchBrace(src, i + 1, e);
      paint(p, i + 1, i + 2, 'bracket');
      lexValues(p, i + 2, c);
      paint(p, c, c + 1, 'bracket');
      i = c + 1;
    } else if (ch === '$') {
      let c = i + 1;
      while (c < e && /[\w-]/.test(src[c])) c += 1;
      paint(p, i, c, 'variable');
      i = c;
    } else if (/[\w.#%-]/.test(ch)) {
      let c = i;
      while (c < e && /[\w.#%-]/.test(src[c])) c += 1;
      const isFunction = src[c] === '(';
      const isColor = ch === '#';
      paint(p, i, c, isFunction ? 'function' : isColor ? 'default' : 'variable');
      i = c;
    } else {
      i += 1;
    }
  }
}

function lexScss(p: Paint, start: number, end: number) {
  const { src } = p;
  // Whether each open block is a @keyframes body, whose `from` and `to` are keyframe
  // selectors rather than a `selectors` node, so the depth walker never sees them.
  const blocks: boolean[] = [];
  let i = start;

  while (i < end) {
    if (isSpace(src[i])) {
      i += 1;
      continue;
    }
    if (src.startsWith('/*', i)) {
      const e = Math.min(src.indexOf('*/', i + 2) + 2 || end, end);
      paint(p, i, e, 'comment');
      i = e;
      continue;
    }
    if (src.startsWith('//', i)) {
      const stop = src.indexOf('\n', i);
      const e = stop < 0 || stop > end ? end : stop;
      paint(p, i, e, 'comment');
      i = e;
      continue;
    }
    if (src[i] === '}' || src[i] === '{') {
      if (src[i] === '}') blocks.pop();
      paint(p, i, i + 1, 'bracket');
      i += 1;
      continue;
    }

    // One statement: up to `{`, `;` or `}` at the top level.
    let k = i;
    let paren = 0;
    while (k < end) {
      const ch = src[k];
      if (ch === '"' || ch === "'") {
        k = skipString(src, k);
        continue;
      }
      if (src.startsWith('#{', k)) {
        k = matchBrace(src, k + 1, end) + 1;
        continue;
      }
      if (ch === '(') paren += 1;
      if (ch === ')') paren -= 1;
      if (paren === 0 && (ch === '{' || ch === ';' || ch === '}')) break;
      k += 1;
    }
    const terminator = src[k];
    const [s, e] = trimRange(src, [i, k]);

    if (src[s] === '@') {
      let w = s + 1;
      while (w < e && /[\w-]/.test(src[w])) w += 1;
      paint(p, s, w, 'builtin');
      if (terminator === '{') blocks.push(/^@(?:-\w+-)?keyframes$/.test(src.slice(s, w)));
      if (/^@include\b/.test(src.slice(s, w))) {
        let n = w;
        while (n < e && isSpace(src[n])) n += 1;
        let ne = n;
        while (ne < e && /[\w.-]/.test(src[ne])) ne += 1;
        paint(p, n, ne, 'function');
        lexValues(p, ne, e);
      } else {
        lexValues(p, w, e);
      }
    } else if (terminator === '{' && blocks.at(-1)) {
      blocks.push(false);
    } else if (terminator === '{') {
      blocks.push(false);
      paintSelectorList(src, s, e, 0, p.depths);
      for (let c = s; c < e; c += 1) if (p.depths[c] !== null) p.faces[c] = 'selector';
    } else {
      const colon = src.indexOf(':', s);
      if (colon > 0 && colon < e) {
        const isVariable = src[s] === '$';
        paint(p, s, colon, isVariable ? 'variable' : 'keyword');
        lexValues(p, colon + 1, e);
      }
    }

    if (terminator === ';') i = k + 1;
    else i = k;
  }
}

// ----------------------------------------------------------------------------------------
// The Astro host: markup, and the ranges each embedded parser is given.

type RangeSpec = Omit<Range, 'id'>;

function embed(p: Paint, ranges: Range[], spec: RangeSpec): string {
  const id = `r${ranges.length}`;
  ranges.push({ id, ...spec });
  p.owner.fill(id, spec.start, spec.end);
  return id;
}

function styleLang(startTag: string): Lang {
  return /lang=["'](?:scss|sass)["']|type=["']text\/scss["']/.test(startTag) ? 'scss' : 'css';
}

function lexTemplate(p: Paint, ranges: Range[], start: number, end: number) {
  const { src } = p;
  let i = start;
  let elementDepth = 0;

  while (i < end) {
    const ch = src[i];

    if (src.startsWith('<!--', i)) {
      const e = Math.min(src.indexOf('-->', i + 4) + 3 || end, end);
      paint(p, i, e, 'comment');
      i = e;
      continue;
    }

    if (ch === '<' && (isIdentStart(src[i + 1]) || src[i + 1] === '/' || src[i + 1] === '>')) {
      const closing = src[i + 1] === '/';
      const nameStart = i + (closing ? 2 : 1);
      paint(p, i, nameStart, 'bracket');
      let e = nameStart;
      while (e < end && /[\w.:-]/.test(src[e])) e += 1;
      const name = src.slice(nameStart, e);
      if (name) paint(p, nameStart, e, tagFace(name));
      i = e;

      let selfClosing = false;
      while (i < end && src[i] !== '>') {
        if (src.startsWith('/>', i)) {
          paint(p, i, i + 2, 'bracket');
          i += 2;
          selfClosing = true;
          break;
        }
        if (src[i] === '{') {
          // A spread or shorthand attribute: `{...props}`.
          const close = matchBrace(src, i, end);
          paint(p, i, i + 1, 'bracket');
          paint(p, close, close + 1, 'bracket');
          embed(p, ranges, {
            lang: 'tsx',
            node: 'attribute_js_expr',
            rule: 'attribute_interpolation (attribute_js_expr)',
            offset: false,
            start: i + 1,
            end: close,
          });
          lexTsx(p, i + 1, close);
          i = close + 1;
        } else if (/[^\s=>/]/.test(src[i])) {
          let a = i;
          while (a < end && /[^\s=>/]/.test(src[a])) a += 1;
          paint(p, i, a, 'constant');
          i = a;
          if (src[i] === '=') {
            i += 1;
            if (src[i] === '"' || src[i] === "'") {
              const s = skipString(src, i);
              paint(p, i, s, 'string');
              i = s;
            } else if (src[i] === '{') {
              const close = matchBrace(src, i, end);
              paint(p, i, i + 1, 'bracket');
              paint(p, close, close + 1, 'bracket');
              embed(p, ranges, {
                lang: 'tsx',
                node: 'attribute_js_expr',
                rule: 'attribute_interpolation (attribute_js_expr)',
                offset: false,
                start: i + 1,
                end: close,
              });
              lexTsx(p, i + 1, close);
              i = close + 1;
            } else if (src[i] === '`') {
              const s = skipString(src, i);
              paint(p, i, s, 'string');
              i = s;
            }
          }
        } else {
          i += 1;
        }
      }

      if (selfClosing) continue;
      const tagEnd = i;
      if (src[i] === '>') {
        paint(p, i, i + 1, 'bracket');
        i += 1;
      }

      if (closing) {
        elementDepth -= 1;
        continue;
      }

      // Raw text elements: their bodies go to their own parser.
      if (name === 'style' || name === 'script') {
        const closeTag = src.indexOf(`</${name}`, i);
        const bodyEnd = closeTag < 0 ? end : closeTag;
        if (name === 'style') {
          const lang = styleLang(src.slice(nameStart, tagEnd));
          embed(p, ranges, {
            lang,
            node: 'raw_text',
            rule: `style_element (raw_text), picked by lang="${lang}"`,
            offset: false,
            start: i,
            end: bodyEnd,
          });
          lexScss(p, i, bodyEnd);
        } else {
          embed(p, ranges, {
            lang: 'tsx',
            node: 'raw_text',
            rule: 'script_element (raw_text)',
            offset: false,
            start: i,
            end: bodyEnd,
          });
          lexTsx(p, i, bodyEnd, true);
        }
        i = bodyEnd;
        elementDepth += 1;
        continue;
      }

      if (!VOID_TAGS.has(name) && name) elementDepth += 1;
      continue;
    }

    if (ch === '{') {
      const close = matchBrace(src, i, end);
      paint(p, i, i + 1, 'bracket');
      paint(p, close, close + 1, 'bracket');
      // Only element-owned interpolations get a range, and one range holds all of it:
      // any interpolation nested inside is part of the same TSX program.
      if (elementDepth > 0) {
        embed(p, ranges, {
          lang: 'tsx',
          node: 'html_interpolation',
          rule: "element (html_interpolation), :offset '(1 . -1)",
          offset: true,
          start: i + 1,
          end: close,
        });
      }
      lexTsx(p, i + 1, close);
      i = close + 1;
      continue;
    }

    i += 1;
  }
}

function tokenize(p: Paint): Line[] {
  const { src } = p;
  const lines: Line[] = [];
  let number = 1;
  let tokens: Token[] = [];

  for (let i = 0; i < src.length; ) {
    if (src[i] === '\n') {
      lines.push({ number, tokens });
      number += 1;
      tokens = [];
      i += 1;
      continue;
    }
    let e = i + 1;
    const same = (j: number) =>
      src[j] !== '\n' && p.faces[j] === p.faces[i] && p.depths[j] === p.depths[i] && p.owner[j] === p.owner[i];
    while (e < src.length && same(e)) e += 1;
    const face = p.faces[i];
    tokens.push({
      text: src.slice(i, e),
      face,
      depth: face === 'selector' ? p.depths[i] : null,
      range: p.owner[i],
    });
    i = e;
  }
  if (tokens.length > 0) lines.push({ number, tokens });
  return lines;
}

function newPaint(src: string): Paint {
  return {
    src,
    faces: Array<Face>(src.length).fill('default'),
    depths: Array<number | null>(src.length).fill(null),
    owner: Array<string>(src.length).fill('host'),
  };
}

/** Captures an `.astro` file the way web-ts-mode paints and splits it. */
export function captureAstro(src: string): Capture {
  const p = newPaint(src);
  const ranges: Range[] = [];

  let templateStart = 0;
  if (src.startsWith('---')) {
    const close = src.indexOf('\n---', 3);
    if (close > 0) {
      paint(p, 0, 3, 'comment');
      paint(p, close + 1, close + 4, 'comment');
      embed(p, ranges, {
        lang: 'tsx',
        node: 'frontmatter_js_block',
        rule: 'frontmatter (frontmatter_js_block)',
        offset: false,
        start: 3,
        end: close,
      });
      lexTsx(p, 3, close, true);
      templateStart = close + 4;
    }
  }

  lexTemplate(p, ranges, templateStart, src.length);
  return { lines: tokenize(p), ranges };
}

/** Captures a bare stylesheet, for the selector depth sheet. */
export function captureScss(src: string): Capture {
  const p = newPaint(src);
  lexScss(p, 0, src.length);
  return { lines: tokenize(p), ranges: [] };
}
