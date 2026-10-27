// Writes the address as character references so a scraper grepping the HTML for
// something@something finds nothing, while browsers decode it with or without JS.
const refs = (s: string) => Array.from(s, (c) => `&#${c.codePointAt(0)};`).join('');

// `print` is the address paper shows in place of the screen one (src/scss/print.scss).
export const mailLink = (email: string, print?: string) =>
  print
    ? `<a href="${refs(`mailto:${email}`)}" data-print="${refs(print)}"><span>${refs(email)}</span></a>`
    : `<a href="${refs(`mailto:${email}`)}">${refs(email)}</a>`;
