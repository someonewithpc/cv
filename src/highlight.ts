/**
 * The site's one syntax highlighter, run at build. Shiki tokenises with a theme whose colours
 * only stand for token kinds, and each token is written as a span with a tok-<kind> class, so
 * the colours come from scss/_code.scss and follow the theme picker. Inline code and code
 * blocks share it.
 */
import { createHighlighter, type ThemeRegistration } from 'shiki';

export type CodeLang = 'ts' | 'css' | 'html' | 'xml' | 'php';

const KINDS: Record<string, string[]> = {
  keyword: ['keyword', 'storage', 'punctuation.definition.keyword'],
  tag: ['entity.name.tag'],
  selector: [
    'entity.other.attribute-name.pseudo-class',
    'entity.other.attribute-name.pseudo-element',
    'entity.other.attribute-name.id',
    'entity.other.attribute-name.class',
    'entity.name.tag.css',
    'meta.selector punctuation.definition.entity.css',
  ],
  attribute: ['entity.other.attribute-name'],
  property: [
    'support.type.property-name',
    'meta.definition.variable',
    'variable.other.constant',
    'variable.other.php',
    'punctuation.definition.variable',
    'constant.other.php',
  ],
  function: ['entity.name.function', 'support.function', 'support.class', 'support.attribute', 'support.other.namespace'],
  string: ['string', 'punctuation.definition.string'],
  number: ['constant.numeric', 'constant.language', 'keyword.other.unit', 'support.constant.property-value'],
  punctuation: ['punctuation', 'meta.brace'],
  comment: ['comment', 'punctuation.definition.comment'],
};

/* Each kind's stand-in colour, which Shiki hands back on the token. */
const stand = (index: number) => `#0000${(index + 2).toString(16).padStart(2, '0')}`;
const kindOf = new Map(Object.keys(KINDS).map((kind, index) => [stand(index), kind]));

const theme: ThemeRegistration = {
  name: 'cv',
  type: 'dark',
  colors: { 'editor.foreground': '#000001', 'editor.background': '#000000' },
  tokenColors: Object.values(KINDS).map((scope, index) => ({ scope, settings: { foreground: stand(index) } })),
};

const highlighter = await createHighlighter({ themes: [theme], langs: ['ts', 'css', 'html', 'xml', 'php'] });

export const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const span = (text: string, kind?: string) => (kind ? `<span class="tok-${kind}">${escapeHtml(text)}</span>` : escapeHtml(text));

/* One line's tokens as spans, from column `from` to `to` of the tokenised text. Each insert
   is markup put in at its column, splitting the token it falls in. */
const renderLine = (tokens: Token[], from = 0, to = Infinity, inserts: [number, string][] = []) => {
  let at = 0;
  let out = '';
  let next = 0;
  const flush = (upto: number) => {
    while (next < inserts.length && inserts[next][0] <= upto) out += inserts[next++][1];
  };
  for (const { content, color } of tokens) {
    const kind = color && kindOf.get(color.toLowerCase());
    let pos = Math.max(at, from);
    const end = Math.min(at + content.length, to);
    while (pos < end) {
      flush(pos);
      const stop = next < inserts.length && inserts[next][0] < end ? inserts[next][0] : end;
      out += span(content.slice(pos - at, stop - at), kind);
      pos = stop;
    }
    at += content.length;
  }
  flush(Infinity);
  return out;
};

/* SVG path data (and points): the grammar is regular, so a regex splits it into commands,
   numbers, commas and space. */
const PATH_PART = /([MLHVCSQTAZ])|([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)|(,)|(\s+)|(.)/gi;
const PATH_DATA = /^\s*[MLHVCSQTAZ][MLHVCSQTAZ\d\s,.e+-]*$/i;

const pathSpans = (text: string) =>
  [...text.matchAll(PATH_PART)]
    .map(([part, command, number, comma, space]) =>
      span(part, command ? 'command' : number ? 'number' : comma ? 'punctuation' : space ? undefined : 'string'))
    .join('');

/* Attribute values that are path data or a lone number, which the markup grammar reads as a
   plain string. */
const VALUE_GRAMMAR: Record<string, (text: string) => string> = {
  d: pathSpans,
  points: pathSpans,
  pathLength: (text) => span(text, 'number'),
};

type Token = { content: string; color?: string };

/* Splits the string tokens of each such attribute's value, across lines, and leaves the quotes
   as strings. Returns the lines as spans. */
const renderMarkup = (lines: Token[][]) => {
  let grammar: ((text: string) => string) | undefined;
  let quotes = 0;
  return lines.map((line) =>
    line
      .map(({ content, color }) => {
        const kind = color && kindOf.get(color.toLowerCase());
        if (kind === 'attribute') {
          grammar = VALUE_GRAMMAR[content.trim()];
          quotes = 0;
        } else if (kind === 'tag') grammar = undefined;
        if (!grammar || kind !== 'string') return span(content, kind);
        return content
          .split(/(")/)
          .map((part) => {
            if (!part) return '';
            if (part !== '"') return quotes === 1 ? grammar!(part) : span(part, kind);
            quotes += 1;
            return span(part, kind);
          })
          .join('');
      })
      .join(''),
  );
};

const classes = (className: string) => ['hl', className].join(' ').trim();

/**
 * A code block: <pre class="hl"><code> with one span.line per line. `lineComment` marks a
 * listing's own notes that the language has no syntax for (the path data sheet's `--`): each
 * runs to the end of its line, is left out of the tokenising and set as a comment. In markup,
 * a d or points value is split into path commands and numbers.
 */
export const highlightBlock = (code: string, lang: CodeLang, { lineComment = '', className = '' } = {}) => {
  const lines = code.split('\n');
  const notes = lines.map((line) => (lineComment && line.includes(lineComment) ? line.slice(line.indexOf(lineComment)) : ''));
  const bare = lines.map((line, index) => line.slice(0, line.length - notes[index].length)).join('\n');
  const tokens = highlighter.codeToTokensBase(bare, { lang, theme: 'cv' });
  const rendered = lang === 'xml' || lang === 'html' ? renderMarkup(tokens) : tokens.map((line) => renderLine(line));
  const body = rendered.map((line, index) => `<span class="line">${line}${span(notes[index], notes[index] ? 'comment' : undefined)}</span>`);
  return `<pre class="${classes(className)}" data-lang="${lang}"><code>${body.join('\n')}</code></pre>`;
};

/**
 * Inline code. A word alone can miss its grammar (viewBox is an attribute only inside a
 * tag), so `context` tokenises it between a prefix and a suffix and keeps the word's tokens.
 */
/**
 * The spans of a code line or lines, with no element round them, for markup that already has
 * its own box. PHP is tokenised after an opening tag, which the grammar needs to leave markup
 * mode; the tag is not part of the result. One entry per line, each tokenised with its
 * neighbours. `context` is tokenised round the code and left out, as for inline code, and may
 * run over lines. Each character of `inserts` found in the code is taken out before tokenising
 * and its markup put back in its place, for a mark or a line break opportunity inside a token.
 */
export const highlightLines = (
  code: string,
  lang: CodeLang,
  { context = ['', ''], inserts = {} }: { context?: [string, string]; inserts?: Record<string, string> } = {},
) => {
  const before = (lang === 'php' ? '<?php ' : '') + context[0];
  const skip = before.split('\n').length - 1;
  const column = before.length - before.lastIndexOf('\n') - 1;
  const keys = Object.keys(inserts);
  const marker = keys.length ? new RegExp(keys.map((key) => key.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')).join('|'), 'g') : null;
  const lines = code.split('\n').map((line, index) => {
    const offset = index === 0 ? column : 0;
    const at: [number, string][] = [];
    let taken = 0;
    const bare = marker
      ? line.replace(marker, (char, where: number) => {
          at.push([offset + where - taken, inserts[char]]);
          taken += char.length;
          return '';
        })
      : line;
    return { bare, offset, at };
  });
  const tokens = highlighter.codeToTokensBase(before + lines.map(({ bare }) => bare).join('\n') + context[1], { lang, theme: 'cv' });
  return lines.map(({ bare, offset, at }, index) => renderLine(tokens[skip + index], offset, offset + bare.length, at));
};

/** One line of code as spans, for a box that exists already. */
export const highlightSpans = (code: string, lang: CodeLang, context: [string, string] = ['', '']) =>
  highlightLines(code, lang, { context })[0];

export const highlightInline = (code: string, lang: CodeLang, context: [string, string] = ['', ''], className = '') => {
  const [before, after] = context;
  const tokens = highlighter.codeToTokensBase(before + code + after, { lang, theme: 'cv' }).flat();
  return `<code class="${classes(className)}">${renderLine(tokens, before.length, before.length + code.length)}</code>`;
};

/* How a code word in prose is read: path data if it parses as such, `l -1, -0.707`, then a
   hint in braces, `{attr}viewBox`, else a tag if it looks like one, else TypeScript. */
const HINTS: Record<string, [CodeLang, [string, string]]> = {
  ts: ['ts', ['', '']],
  fn: ['ts', ['', '()']],
  str: ['ts', ["'", "'"]],
  css: ['css', ['', '']],
  prop: ['css', ['a{', '}']],
  attr: ['xml', ['<a ', '="">']],
};

export const highlightWord = (word: string) => {
  if (PATH_DATA.test(word) && /\d/.test(word)) return `<code class="hl">${pathSpans(word)}</code>`;
  const hint = word.match(/^\{(\w+)\}/);
  if (hint && HINTS[hint[1]]) return highlightInline(word.slice(hint[0].length), ...HINTS[hint[1]]);
  if (/^<\/?[\w-]+.*>$/.test(word)) return highlightInline(word, 'html');
  return highlightInline(word, 'ts');
};

/** Prose with code words in backticks, escaped, each word highlighted as inline code. */
export const ticks = (text: string) =>
  text.split(/`([^`]+)`/).map((part, index) => (index % 2 ? highlightWord(part) : escapeHtml(part))).join('');
