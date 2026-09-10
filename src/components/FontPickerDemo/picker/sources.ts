import loadFontFacesFromStyleElement, { mergeFaces } from './loadFontFacesFromStyleElement';
import manualIframe from './manualIframe';

export type LoadedFaces = Record<string, string>;

// fonts.googleapis.com sends `access-control-allow-origin: *`, so no proxy needed here
export async function loadGoogleFont(family: string, signal: AbortSignal): Promise<LoadedFaces> {
  const res = await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}`, { signal });
  if (!res.ok || res.headers.get('content-type')?.startsWith('text/css') !== true) throw new Error('Not a Google font');

  // A detached <style> has no sheet, so the CSS gets a document of its own
  const doc = new DOMParser().parseFromString(`<html><head><style>${await res.text()}</style></head></html>`, 'text/html');
  return loadFontFacesFromStyleElement(doc.head.children[0] as HTMLStyleElement);
}

export async function loadPageFonts(url: string, signal: AbortSignal): Promise<LoadedFaces> {
  const absolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`;

  const result = await manualIframe(absolute, signal);
  if (!result) throw new Error('Nothing to load');

  const maps = await Promise.all(
    [...result.doc.querySelectorAll('style')].map((el) => loadFontFacesFromStyleElement(el, absolute)),
  );
  const faces: LoadedFaces = mergeFaces(maps);

  if (Object.keys(faces).length === 0) throw new Error('No web fonts found');
  return faces;
}
