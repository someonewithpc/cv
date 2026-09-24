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

/*
 * A hook that handles the complexities of getting the font faces the browser is aware of, from
 * both the page's own stylesheets and any source the user loads through the picker's subforms.
 *
 * @return An object with
 *   - `fontFaces` a list of objects describing the font faces
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

  return {
    fontFaces: simplifiedFontFaces,
  };
}
