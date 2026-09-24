import { proxiedFetch } from './proxiedFetch';

function findStyleImports(style: HTMLStyleElement) {
  return [...(style.sheet?.cssRules ?? [])]
    .filter((rule) => rule instanceof CSSImportRule)
    // CSSImportRule.href is the raw URL as written; the parsed doc's <base> knows the real origin
    .map((rule) => ({ href: new URL(rule.href, style.ownerDocument.baseURI).toString() }));
}

type FetchedStylesheet = { contentType: string, text: string };

const stylesheetCache = new Map<string, Promise<FetchedStylesheet | null>>();

async function fetchStylesheet(source: { href: string }, signal: AbortSignal): Promise<FetchedStylesheet | null> {
  if (!stylesheetCache.has(source.href)) {
    const promise = proxiedFetch(source.href, { signal })
      .then(async (res) => {
        if (!res.ok) return null;
        return {
          contentType: res.headers.get('content-type') ?? '',
          text: await res.text(),
        };
      })
      .catch(() => {
        stylesheetCache.delete(source.href);
        return null;
      });
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
  return sources.filter((source) => {
    if (seen.has(source.href)) return false;
    seen.add(source.href);
    return true;
  });
}

function processStylesheetResponses(responses: (FetchedStylesheet | null)[], doc: Document, signal: AbortSignal, seen: Set<string>): Promise<any> {
  return Promise.all(
    responses.map(async (response) => {
      if (response === null) return null;
      if (!response.contentType.startsWith('text/css')) return null;

      const el = doc.createElement('style');
      el.innerHTML = response.text;
      doc.body.append(el);

      const subResponses = await Promise.all(
        unseen(findStyleImports(el), seen)
          .map((source) => fetchStylesheet(source, signal).catch(() => null))
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

  if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('text/html')) throw new Error('Invalid URL');

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
    unseen([...stylesheetLinks, ...styleImports], seen).map((source) => fetchStylesheet(source, signal).catch(() => null))
  );

  await processStylesheetResponses(stylesheetResponses, doc, signal, seen);

  return { doc };
}
