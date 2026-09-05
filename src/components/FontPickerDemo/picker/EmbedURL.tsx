import { type Dispatch, type SetStateAction, useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';

import { registerExternalFontFaceDeclarations } from './fontState';
import { useDebounce } from './useDebounce';
import { useFontQuery } from './useFontQuery';

import manualIframe from './manualIframe';
import loadFontFacesFromStyleElement from './loadFontFacesFromStyleElement';
import { ExternalFontSubForm, type SubFormProps } from './ExternalFontSubForm';

function useEmbedQueryOptions(iframeURL: string) {
  return {
    queryKey: useDebounce(['FontPickerDemo/EmbedURL', iframeURL], 250),
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      manualIframe(iframeURL, signal).then((result) => {
        if (!result) return null;
        const { doc } = result;

        return Promise.all(
          [...doc.querySelectorAll('style')].map(
            (el) => loadFontFacesFromStyleElement(el, iframeURL).then((map) => {
              registerExternalFontFaceDeclarations(map);
              return map;
            }),
          )
        ).then((maps) => {
          if (maps.every((map) => Object.keys(map).length === 0)) throw new Error('No web fonts found');
          return maps;
        });
      }),
  };
}

export function EmbedURLImpl({
  setSubFormNotEmpty,
  state: {
    iframeURL,
    setIframeURL,
  },
}: SubFormProps<{
  iframeURL: string,
  setIframeURL: Dispatch<SetStateAction<string>>
}>) {

  useFontQuery(useEmbedQueryOptions(iframeURL));

  useEffect(() => {
    setSubFormNotEmpty(iframeURL !== '');
  }, [iframeURL, setSubFormNotEmpty]);

  return (
    <>
      <div
        title="The URL of a page whose fonts you want to borrow"
      >
        <label
          htmlFor="font-picker-embed-url-input"
        >
          Page URL
        </label>
        <input
          id="font-picker-embed-url-input"
          type="text"
          value={iframeURL}
          onChange={(e) => setIframeURL(e.target.value)}
          className="w-100"
        />
      </div>
      <p>
        Borrow the faces of any page with distinctive typography
      </p>
      <p role="alert">
        <FontAwesomeIcon icon={faTriangleExclamation} />&nbsp;
        Extracted faces stay pinned to the files that page serves today
      </p>
    </>
  );
}

export function EmbedURL({ visible }: { visible: boolean }) {
  const [iframeURL, setIframeURL] = useState('');

  return (
    <ExternalFontSubForm
      visible={visible}
      subform={EmbedURLImpl}
      subformState={{ iframeURL, setIframeURL }}
      queryOptions={useEmbedQueryOptions(iframeURL)}
    />
  );
}
