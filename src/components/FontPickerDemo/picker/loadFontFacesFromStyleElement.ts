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

export default async function loadFontFacesFromStyleElement(el: HTMLStyleElement, baseURL: string | undefined = undefined) {
  const rules = [...(el.sheet?.cssRules ?? [])];
  const toLoad: Record<string, FontFace> = {};
  const fontFaceRules: Record<keyof typeof toLoad, CSSFontFaceRule> = {};
  const finalSrcs: Record<keyof typeof toLoad, string> = {};

  rules.forEach((rule) => {
    if (!(rule instanceof CSSFontFaceRule)) return;

    const src = rule.style.getPropertyValue('src');
    const fontFamily = rule.style.getPropertyValue('font-family');

    if (!fontFamily || !src) return;

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

    if (!haveFont) {
      toLoad[unquotedFontFamily] = ff;
      fontFaceRules[unquotedFontFamily] = rule;
      finalSrcs[unquotedFontFamily] = finalSrc;
    }
  });

  return Promise.all(
    Object.values(toLoad).map(
      (ff) => ff.load().then((loaded) => {
        document.fonts.add(loaded);
        return loaded;
      })
    )
  ).then((didLoad) => {
    // @ts-ignore FontFaceSetLoadEvent isn't in every lib.dom yet
    document.fonts.dispatchEvent(new (window['FontFaceSetLoadEvent'] ?? Event)('loadingdone', { fontfaces: didLoad }));

    return Object.fromEntries(
      didLoad.map((ff) => {
        const unquotedFontFamily = ff.family.replaceAll('"', '');
        const rule = fontFaceRules[unquotedFontFamily];

        const src = rule.style.getPropertyValue('src');

        return [
          unquotedFontFamily,
          // Ensure the CSS we store for re-embedding keeps a loadable (absolute or proxied) URL
          rule.cssText.replace(src, finalSrcs[unquotedFontFamily]),
        ];
      }),
    );
  });
}
