// Writes the address as character references so a scraper grepping the HTML for
// something@something finds nothing, while browsers decode it with or without JS.
const refs = (s: string) => Array.from(s, (c) => `&#${c.codePointAt(0)};`).join('');

export const mailLink = (email: string) => `<a href="${refs(`mailto:${email}`)}">${refs(email)}</a>`;
