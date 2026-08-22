import { type Dispatch, type SetStateAction, useEffect, useState } from 'react';

import { registerExternalFontFaceDeclarations } from './fontState';
import { useDebounce } from './useDebounce';
import { useFontQuery } from './useFontQuery';

import loadFontFacesFromStyleElement from './loadFontFacesFromStyleElement';
import { ExternalFontSubForm, type SubFormProps } from './ExternalFontSubForm';

// fonts.googleapis.com sends `access-control-allow-origin: *`, so no proxy needed here
function googleQueryOptions(fontFamily: string, queryKey: unknown[]) {
  return {
    queryKey,
    queryFn: ({ signal }: { signal: AbortSignal }) => {
      if (fontFamily === '') return Promise.resolve(null);

      const url = `https://fonts.googleapis.com/css2?family=${fontFamily}`;

      return fetch(url, { signal }).then(async (res) => {
        if (!res.ok || res.headers.get('content-type')?.startsWith('text/css') !== true) throw new Error('Invalid font');

        // We need to create a new document because:
        //   1. We don't want to add the CSS directly into the main document
        //   2. If we simply add the text into a <style> element which is not in a document, its `.rules` will be empty
        const parser = new DOMParser();
        const doc = parser.parseFromString(`<html><head><style>${await res.text()}</style></head></html>`, 'text/html');
        const style = doc.head.children[0] as HTMLStyleElement;

        return loadFontFacesFromStyleElement(style).then((map) => {
          registerExternalFontFaceDeclarations(map);
          return map;
        });
      });
    },
  };
}

function useGoogleQueryOptions(fontFamily: string) {
  return googleQueryOptions(fontFamily, useDebounce(['FontPickerDemo/GoogleFont', fontFamily], 250));
}

export function GoogleFontImpl(
  { setSubFormNotEmpty, state: { fontFamily, rawFontFamily, setFontFamily } }:
  SubFormProps<{ fontFamily: string, rawFontFamily: string, setFontFamily: Dispatch<SetStateAction<string>> }>
) {

  useFontQuery(useGoogleQueryOptions(fontFamily));

  useEffect(() => {
    setSubFormNotEmpty(fontFamily !== '');
  }, [fontFamily, setSubFormNotEmpty]);

  return (
    <>
      <label>Font Family</label>
      <input
        className="w-100"
        value={rawFontFamily}
        onChange={(e) => setFontFamily(e.currentTarget.value)}
      />
      <p>
        Enter a name of a font that can be found on&nbsp;
        <a
          href="https://fonts.google.com/"
          target="_blank"
          rel="noreferrer"
        >Google Fonts</a>
      </p>
    </>
  );
}

export function GoogleFont({ visible }: { visible: boolean }) {
  const [rawFontFamily, setFontFamily] = useState('');
  const fontFamily = rawFontFamily.trim();

  return (
    <ExternalFontSubForm
      visible={visible}
      subform={GoogleFontImpl}
      queryOptions={useGoogleQueryOptions(fontFamily)}
      subformState={{ fontFamily, rawFontFamily, setFontFamily }}
    />
  );
}
