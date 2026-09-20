import { camelCase } from 'lodash';

import { getCurrentFonts } from './getCurrentFonts';
import { proxyPrefix } from './proxiedFetch';
import { transformFontFaceSrcToProxiedAbsoluteURL } from './transformFontFaceSrcToProxiedAbsoluteURL';

let preconnects: string[] | undefined;
function preconnectedHosts() {
  preconnects ??= Array.from(document.querySelectorAll('link[rel="preconnect"]') as NodeListOf<HTMLLinkElement>)
    .map(({ href }) => new URL(href).hostname);
  return preconnects;
}

type Candidate = { family: string, face: FontFace, rule: CSSFontFaceRule, finalSrc: string };

/**
 * Loads the page's @font-face rules and returns, per family, the CSS that re-embeds them.
 * Every rule loads, not one per family: a family comes as one rule per weight and style,
 * and often one per unicode-range subset on top, and keeping only the last would leave
 * Latin text on the fallback whenever that last one is the Vietnamese subset.
 */
export default async function loadFontFacesFromStyleElement(el: HTMLStyleElement, baseURL: string | undefined = undefined) {
  const rules = [...(el.sheet?.cssRules ?? [])];
  const candidates: Candidate[] = [];

  rules.forEach((rule) => {
    if (!(rule instanceof CSSFontFaceRule)) return;

    const src = rule.style.getPropertyValue('src');
    const fontFamily = rule.style.getPropertyValue('font-family');

    // local()-only rules are metric-override fallbacks, not web fonts, and reject
    // when the named font is not installed
    if (!fontFamily || !src || !/url\(/.test(src)) return;

    // Absolute URLs routed through our proxy, since webfont loads are CORS-gated
    const { transformed, relativeSources } = transformFontFaceSrcToProxiedAbsoluteURL(src, baseURL, proxyPrefix);

    // If all sources are already preconnected (e.g. fonts.gstatic.com), fetch them directly
    const finalSrc = relativeSources.every((s) => preconnectedHosts().includes(
      new URL(s, baseURL !== '' ? baseURL : undefined).hostname
    )) ? src : transformed;

    const descriptors: FontFaceDescriptors = Object.fromEntries(
      Array.from(rule.style) // A list of kebab-case property names declared in this rule
        .filter((prop) => !['font-family', 'src'].includes(prop))
        .map((prop) => [
          camelCase(prop.replace('font-', '')), // Remove 'font-' prefix
          rule.style.getPropertyValue(prop),
        ])
        .filter(([, value]) => !!value),
    );

    const unquotedFontFamily = fontFamily.replaceAll('"', '');

    const ff = new FontFace(
      unquotedFontFamily,
      finalSrc,
      descriptors,
    );

    // document.fonts.has() uses object equality, so we must check all fonts we know of
    // on whether they have the same properties as the new one
    const haveFont = getCurrentFonts().some((current) => {
      const props = [...Object.keys(descriptors), 'family'] as unknown as (keyof FontFace)[];
      return props.every((p) => current[p] === ff[p]);
    });

    if (!haveFont) candidates.push({ family: unquotedFontFamily, face: ff, rule, finalSrc });
  });

  // One face failing (a 404, an unsupported format) must not discard the rest of the page
  return Promise.allSettled(
    candidates.map(
      (candidate) => candidate.face.load().then((loaded) => {
        document.fonts.add(loaded);
        return candidate;
      })
    )
  ).then((results) => {
    const didLoad = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);

    // @ts-ignore FontFaceSetLoadEvent isn't in every lib.dom yet
    document.fonts.dispatchEvent(new (window['FontFaceSetLoadEvent'] ?? Event)('loadingdone', { fontfaces: didLoad.map(({ face }) => face) }));

    return mergeFaces(didLoad.map(({ family, rule, finalSrc }) => ({
      // Ensure the CSS we store for re-embedding keeps a loadable (absolute or proxied) URL
      [family]: rule.cssText.replace(rule.style.getPropertyValue('src'), finalSrc),
    })));
  });
}

/** Per-family CSS from several sources, a family's rules kept together */
export function mergeFaces(maps: Record<string, string>[]) {
  const merged: Record<string, string> = {};
  for (const map of maps) {
    for (const [family, css] of Object.entries(map)) {
      merged[family] = merged[family] ? `${merged[family]}\n${css}` : css;
    }
  }
  return merged;
}
