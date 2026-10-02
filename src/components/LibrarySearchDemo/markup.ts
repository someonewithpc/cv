import { variantOf } from './objects';
import {
  formatScore,
  mangle,
  search,
  sqlSegments,
  type SearchResult,
  type SearchState,
  type SqlMark,
} from './search';

/* The parts of the blueprint sheets that move with the query, as HTML strings: the layer
   prints them at build time with set:html, and the client swaps them in as the visitor
   types, so both come out of the one function. The layers style them through :global(). */

export function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/** The mangled query, with each rewrite marked by the rule that made it. */
export function mangledHtml(query: string) {
  const { text, segments } = mangle(query);
  if (!text.trim()) return '<span class="empty">(nothing to match)</span>';
  return segments
    .map(({ text, rule }) => (rule === 'plain' ? escapeHtml(text) : `<span class="rule-${rule}">${escapeHtml(text)}</span>`))
    .join('');
}

const BADGE: Record<SqlMark, string> = { where: '1', select: '2', order: '3', max: 'max', comment: '' };

export function sqlHtml(state: SearchState) {
  return sqlSegments(state)
    .map(({ text, mark }) => {
      if (!mark) return escapeHtml(text);
      if (mark === 'comment') return `<span class="sql-comment">${escapeHtml(text)}</span>`;
      return `<span class="frag" data-mark="${mark}"><span class="badge" aria-hidden="true">${BADGE[mark]}</span>${escapeHtml(text)}</span>`;
    })
    .join('');
}

/** How many rows the query returns and the maximum they are measured against. */
export function sqlResultHtml(result: SearchResult) {
  const rows = `${result.hits.length} ${result.hits.length === 1 ? 'row' : 'rows'}`;
  if (result.max === null) return `${rows}, no <code>search_relevance</code> column`;
  return `${rows}, the subquery's <code>MAX()</code> = ${result.max.toFixed(3)}`;
}

const TOP = 6;

function fixed(value: number) {
  return value.toFixed(3);
}

/** The relevance sheet's live part: each term's weight, then how the top rows add up. */
export function relevanceHtml(state: SearchState) {
  const result = search(state);
  const { terms, hits, max, total } = result;

  if (!terms.length) {
    return '<p class="nothing">Type a term: with nothing to match, the objects are listed newest first and nobody has a score.</p>';
  }

  const termRows = terms
    .map(
      (term) => `<tr>
        <td><code>${escapeHtml(term.text)}</code></td>
        <td class="num">${term.df}</td>
        <td class="num">${fixed(term.idf)}</td>
        <td class="num">${term.op === '-' ? '<span class="excluded">excluded</span>' : fixed(term.idf * term.idf)}</td>
      </tr>`,
    )
    .join('');

  const hitRows = hits
    .slice(0, TOP)
    .map((hit) => {
      const sum = terms
        .map((term, i) => (term.op === '-' ? null : `${hit.tf[i]}×${fixed(term.idf * term.idf)}`))
        .filter(Boolean)
        .join(' + ');
      const score = hit.score ?? 0;
      return `<tr>
        <td class="name">${escapeHtml(hit.object.name)} <span class="variant">${escapeHtml(variantOf(hit.object))}</span></td>
        <td class="sum"><code>${sum}</code></td>
        <td class="num">${fixed(hit.relevance)}</td>
        <td class="score"><span class="meter"><span class="bar" style="--score: ${score}"></span><span class="value">${formatScore(hit.score)}</span></span></td>
      </tr>`;
    })
    .join('');

  const more = hits.length > TOP ? `<p class="more">and ${hits.length - TOP} more not shown</p>` : '';
  const empty = hits.length ? '' : '<p class="nothing">No object matches, so there is no maximum to divide by.</p>';

  return `<table class="terms">
      <thead><tr><th>Term</th><th class="num">In</th><th class="num">idf = log₁₀(${total} / in)</th><th class="num">idf²</th></tr></thead>
      <tbody>${termRows}</tbody>
    </table>
    <table class="hits">
      <thead><tr><th>Object</th><th class="sum">Σ tf × idf²</th><th class="num">MATCH</th><th class="score">÷ ${max === null ? 'NULL' : fixed(max)}</th></tr></thead>
      <tbody>${hitRows}</tbody>
    </table>
    ${more}${empty}`;
}
