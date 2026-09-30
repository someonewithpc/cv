/** A CSS string token for any text: nothing in it can close the string, the rule or the sheet */
export function cssString(text: string): string {
  return `"${text.replace(/[\\"]/g, '\\$&').replace(/[\0-\x1f\x7f]/g, (c) => `\\${c.charCodeAt(0).toString(16)} `)}"`;
}

/** The text of a value the CSSOM serialized, quoted string or bare identifiers */
export function unquoteCssString(value: string): string {
  const quoted = /^(["'])(.*)\1$/s.exec(value.trim());
  const body = quoted ? quoted[2] : value.trim();
  return body.replace(/\\([0-9a-fA-F]{1,6})\s?|\\([\s\S])/g, (_, hex, char) => {
    if (!hex) return char;
    const code = parseInt(hex, 16);
    return code === 0 || code > 0x10ffff ? '\ufffd' : String.fromCodePoint(code);
  });
}
