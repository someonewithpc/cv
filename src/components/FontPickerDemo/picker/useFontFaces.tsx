import { useState, useEffect, useMemo } from 'react';

import { getCurrentFonts } from './getCurrentFonts';

const FONTFACE_PROPERTIES = [
  'family',
  'weight',
  'style',
] as const;

function unquote(family: string) {
  return family.replace(/^ *\\?['"]?(.*?)\\?['"]? *$/, '$1');
}

export type FontFaceDescriptor = Record<(typeof FONTFACE_PROPERTIES)[number], string>;

// The page's prose is plain sans-serif; Poppins only lives inside the product mockups.
// It is not a FontFace, so the picker offers it as a synthetic entry meaning "no override"
export const PAGE_DEFAULT_FACE: FontFaceDescriptor = { family: 'sans-serif', weight: '400', style: 'normal' };

/*
 * A hook that handles the complexities of getting the font faces the browser is aware of, from
 * both the page's own stylesheets and any source the user loads through the picker's subforms.
 *
 * @return An object with
 *   - `fontFaces` a list of objects describing the font faces
 *   - `selectedFontFace` the face that most closely matches the page's current computed style
 */
export function useFontFaces() {
  const [_fontFaces, setFontFaces] = useState<FontFace[]>(getCurrentFonts());

  // Deduplicate the font faces by the properties we care about (FONTFACE_PROPERTIES), because there
  // are duplicates since each font face has a Unicode range
  const fontFaces = useMemo(
    () => [...new Map(
      (_fontFaces.filter(Boolean) as FontFace[])
        .map((ff) => {
          return [
            // Quoted and bare spellings of one family are the same face
            JSON.stringify(Object.fromEntries(FONTFACE_PROPERTIES.map((prop) => [prop, prop === 'family' ? unquote(ff.family) : ff[prop]]))),
            ff,
          ];
        }),
    ).values()],
    [_fontFaces],
  );

  useEffect(() => {
    const load = () => {
      setFontFaces(getCurrentFonts());
    };

    document.fonts.addEventListener('loadingdone', load);
    return () => {
      document.fonts.removeEventListener('loadingdone', load);
    };
  }, []);

  const simplifiedFontFaces = useMemo(
    () => fontFaces.map((ff) => Object.fromEntries(FONTFACE_PROPERTIES.map((prop) => {
      if (prop === 'family') {
        return [prop, unquote(String(ff[prop]))];
      } else {
        return [prop, ff[prop]];
      }
    }))),
    [fontFaces],
  ) as FontFaceDescriptor[];

  const selectedFontFace = useMemo(
    () => {
      if (!simplifiedFontFaces.length) return undefined;

      const computedStyle = getComputedStyle(document.body);

      // Extract the properties we care from the `computedStyle` so it's in the same format as `simplifiedFontFaces`
      const computedFontFace = Object.fromEntries(
        FONTFACE_PROPERTIES.map((prop) => {
          if (prop === 'family') {
            return [
              prop,
              computedStyle.fontFamily
                .split(',')[0]                                 // Get the first font-family declared
                .replace(/^ *\\?['"]?(.*?)\\?['"]? *$/, '$1'), // Remove surrounding space and quotes
            ];
          } else {
            // @ts-ignore
            const val: string = computedStyle['font-' + prop];
            return [prop, val];
          }
        }),
      ) as FontFaceDescriptor;

      // Find the element of `simplifiedFontFaces` that most closely matches the `computedFontFace`.
      // This is needed because the computed value does not necessarily match the declared one. In
      // particular, the `weight` of the registered font may be `normal`, but the computed may be `400`
      const [{ fontFace: selectedFontFace }] = simplifiedFontFaces
        .map((fontFace) => ({
          fontFace,
          similarity: FONTFACE_PROPERTIES
            .map((prop) => fontFace[prop] === computedFontFace[prop]
              ? ({ family: 2, weight: 1, style: 2 }[prop])
              : 0,
            )
            .reduce((acc: number, val) => acc + val, 0),
        })).sort((a, b) => b.similarity - a.similarity);

      return selectedFontFace;
    },
    [simplifiedFontFaces],
  ) as FontFaceDescriptor;

  return {
    fontFaces: simplifiedFontFaces,
    selectedFontFace,
  };
}
