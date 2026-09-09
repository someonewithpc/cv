import { useId } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';

import { loadPageFonts, type LoadedFaces } from './sources';
import { SubForm, useSubFormInput } from './SubForm';

export function EmbedURL({ visible, onLoaded }: { visible: boolean, onLoaded: (faces: LoadedFaces) => void }) {
  const id = useId();
  const { raw, setRaw, notEmpty, status } = useSubFormInput('embed', (url, signal) => loadPageFonts(url, signal).then(onLoaded));

  return (
    <SubForm visible={visible} notEmpty={notEmpty} status={status}>
      <div title="The URL of the page where the Interactive Map will be embedded, used to extract its fonts">
        <label htmlFor={id}>Embed URL</label>
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
        Enter a URL from which we will extract fonts. Typically, the URL where the map will be shown
      </p>
      <p role="alert">
        <FontAwesomeIcon icon={faTriangleExclamation} />&nbsp;
        Note: selecting a font this way requires that that font file extracted from the page remain
        available in the same location, meaning that if the font used on that page changes, you may
        need to update it here too
      </p>
    </SubForm>
  );
}
