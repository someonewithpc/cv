// The address a link prints after its words: no scheme, no leading www. and no trailing slash,
// so a reader can type it from paper. In-page anchors and mail links print nothing.
export const printUrl = (href: string): string | undefined => {
  if (!/^https?:\/\//i.test(href)) return undefined;

  return href
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/$/, '');
};
