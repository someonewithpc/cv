import { FetchCapError, proxiedFetch } from './proxiedFetch';

// A page's stylesheets, @imports included, that one extraction follows
export const MAX_SHEETS = 32;
// Sheets kept for a later extraction of the same page
const CACHED_SHEETS = 64;

/**
 * The URL a sheet's own relative references resolve against: the sheet's, for one fetched
 * and inlined here, and the page's for a <style> the page carried.
 */
export function stylesheetBase(style: HTMLStyleElement): string {
  return style.dataset.href ?? style.ownerDocument.baseURI;
}

function findStyleImports(style: HTMLStyleElement) {
  return [...(style.sheet?.cssRules ?? [])]
    .filter((rule) => rule instanceof CSSImportRule)
    // CSSImportRule.href is the raw URL as written, relative to the sheet it sits in
    .map((rule) => ({ href: new URL(rule.href, stylesheetBase(style)).toString() }));
}

type FetchedStylesheet = { href: string, contentType: string, text: string };

const stylesheetCache = new Map<string, Promise<FetchedStylesheet | null>>();

async function fetchStylesheet(source: { href: string }, signal: AbortSignal): Promise<FetchedStylesheet | null> {
  if (!stylesheetCache.has(source.href)) {
    const promise = proxiedFetch(source.href, { signal })
      .then(async (res) => {
        if (!res.ok) return null;
        return { href: source.href, contentType: res.contentType, text: await res.text() };
      })
      .catch((error) => {
        stylesheetCache.delete(source.href);
        // A missing sheet is skipped, a tripped limit fails the extraction
        if (error instanceof FetchCapError) throw error;
        return null;
      });
    stylesheetCache.set(source.href, promise);
    if (stylesheetCache.size > CACHED_SHEETS) stylesheetCache.delete(stylesheetCache.keys().next().value!);
  } else {
    // Least recently used goes first
    const promise = stylesheetCache.get(source.href)!;
    stylesheetCache.delete(source.href);
    stylesheetCache.set(source.href, promise);
  }

  return stylesheetCache.get(source.href)!;
}

type Source = { href: string };

// Each sheet is inlined once, however many @imports name it: two sheets importing the same
// fonts.css used to inline it twice and build every face in it twice, and a sheet that
// imported itself, or two that imported each other, was inlined again on every turn of the
// microtask loop until the tab hung (the cache answers repeats with a resolved promise, so
// the signal never got a say).
function unseen(sources: Source[], seen: Set<string>): Source[] {
  const fresh = sources.filter((source) => {
    if (seen.has(source.href)) return false;
    seen.add(source.href);
    return true;
  });
  if (seen.size > MAX_SHEETS) throw new FetchCapError('Too many stylesheets');
  return fresh;
}

function processStylesheetResponses(responses: (FetchedStylesheet | null)[], doc: Document, signal: AbortSignal, seen: Set<string>): Promise<any> {
  return Promise.all(
    responses.map(async (response) => {
      if (response === null) return null;
      if (!response.contentType.startsWith('text/css')) return null;

      const el = doc.createElement('style');
      // Kept on the element: url() and @import inside the sheet are relative to the sheet,
      // and inlined under the page's <base> they would resolve against the page instead
      // (../fonts/x.woff2 from /assets/css/site.css landing at /fonts/ rather than /assets/fonts/).
      el.dataset.href = response.href;
      el.textContent = response.text;
      doc.body.append(el);

      const subResponses = await Promise.all(
        unseen(findStyleImports(el), seen)
          .map((source) => fetchStylesheet(source, signal))
      );

      return processStylesheetResponses(subResponses, doc, signal, seen);
    })
  );
}

/**
 * We want to effectively use an <iframe> to get access to a client page's DOM,
 * so we can extract styling information, however, for security, some have the
 * `X-Frame-Options` header set to `sameorigin`, therefore the browser refuses
 * to do it (since this would easily lead to clickjacking attacks). Therefore,
 * we need to fetch the URL and manually assemble the page. This way is fine,
 * since we don't get access to any cookies, but it's incomplete since we won't
 * execute their JS, so we could potentially miss some styles they inject with
 * JS. We do not care, this is a best effort and the user can pick another page
 */
export default async function manualIframe(url: string, signal: AbortSignal) {
  if (!url) return null;

  new URL(url); // Reject anything that doesn't parse before bothering the proxy

  const res = await proxiedFetch(url, { signal });

  if (!res.ok || !res.contentType.startsWith('text/html')) throw new Error('Invalid URL');

  const parser = new DOMParser();
  const doc = parser.parseFromString(await res.text(), 'text/html');
  const base = doc.createElement('base');
  base.href = url;
  doc.head.prepend(base);

  const stylesheetLinks = [...doc.querySelectorAll('link[rel="stylesheet"]') as NodeListOf<HTMLLinkElement>]
    .map((link) => ({ href: link.href }));
  const styleImports = [...doc.querySelectorAll('style')].map(findStyleImports).flat();

  const seen = new Set<string>();
  const stylesheetResponses = await Promise.all(
    unseen([...stylesheetLinks, ...styleImports], seen).map((source) => fetchStylesheet(source, signal))
  );

  await processStylesheetResponses(stylesheetResponses, doc, signal, seen);

  return { doc };
}
