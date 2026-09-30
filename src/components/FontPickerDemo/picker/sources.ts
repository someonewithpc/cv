import loadFontFacesFromStyleElement, { mergeFaces } from './loadFontFacesFromStyleElement';
import manualIframe, { stylesheetBase } from './manualIframe';
import { cappedFetch, proxiedFetch } from './proxiedFetch';

export type LoadedFaces = Record<string, string>;

// fonts.googleapis.com allows a cross-origin read of the CSS it serves, but not of the 400 it
// answers an unknown family with, and every half-typed name is one of those. Through the proxy
// both come back readable, so a name in progress fails as an error the subform can show instead
// of a CORS failure in the console
export async function loadGoogleFont(family: string, signal: AbortSignal): Promise<LoadedFaces> {
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}`;
  // A static copy of the site, like the branch previews, carries no endpoint to answer. The
  // name that works still works when asked directly, and only the ones on the way to it lose
  // their error to CORS
  let res = await proxiedFetch(url, { signal });
  if (res.status === 404) res = await cappedFetch(url, { signal, direct: true });
  if (!res.ok || !res.contentType.startsWith('text/css')) throw new Error('Not a Google font');

  // A detached <style> has no sheet, so the CSS gets a document of its own. It goes in as
  // text, never markup, so a </style> inside it stays CSS
  const doc = document.implementation.createHTMLDocument();
  const el = doc.createElement('style');
  el.textContent = await res.text();
  doc.head.append(el);
  return loadFontFacesFromStyleElement(el);
}

export async function loadPageFonts(url: string, signal: AbortSignal): Promise<LoadedFaces> {
  const absolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`;

  const result = await manualIframe(absolute, signal);
  if (!result) throw new Error('Nothing to load');

  const maps = await Promise.all(
    [...result.doc.querySelectorAll('style')].map((el) => loadFontFacesFromStyleElement(el, stylesheetBase(el))),
  );
  const faces: LoadedFaces = mergeFaces(maps);

  if (Object.keys(faces).length === 0) throw new Error('No web fonts found');
  return faces;
}
