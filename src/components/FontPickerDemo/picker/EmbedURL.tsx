import { useId } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';

import { loadPageFonts, type LoadedFaces } from './sources';
import { SubForm, useSubFormInput } from './SubForm';

export function EmbedURL({ onLoaded }: { onLoaded: (faces: LoadedFaces) => void }) {
  const id = useId();
  const { raw, setRaw, status } = useSubFormInput('embed', (url, signal) => loadPageFonts(url, signal).then(onLoaded));

  return (
    <SubForm status={status}>
      <div title="The URL of a page whose fonts you want to use">
        <label htmlFor={id}>Page URL</label>
        <input
          id={id}
          className="w-100"
          type="text"
          value={raw}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => setRaw(e.currentTarget.value)}
        />
      </div>
      <p>
        Enter a URL from which we will extract fonts
      </p>
      <p role="alert">
        <FontAwesomeIcon icon={faTriangleExclamation} />&nbsp;
        Note: the extracted font file must stay available at the same location, so if that
        page changes its fonts you may need to update it here too
      </p>
    </SubForm>
  );
}
