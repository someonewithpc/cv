import { useId } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';

import { loadPageFonts, type LoadedFaces } from './sources';
import { SubForm, useSubFormInput } from './SubForm';

const HINT = 'The URL of the page where the Interactive Map will be embedded, used to extract its fonts';

export function EmbedURL({ visible, onLoaded }: { visible: boolean, onLoaded: (faces: LoadedFaces) => void }) {
  const id = useId();
  const { raw, setRaw, notEmpty, status } = useSubFormInput('embed', loadPageFonts, onLoaded);

  return (
    <SubForm visible={visible} notEmpty={notEmpty} status={status}>
      <div title={HINT}>
        <label htmlFor={id}>Embed URL</label>
        <input
          id={id}
          aria-describedby={`${id}-hint`}
          className="w-100"
          data-demo-target="embed"
          type="text"
          value={raw}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => setRaw(e.currentTarget.value)}
        />
        <span id={`${id}-hint`} className="sr-only">{HINT}</span>
      </div>
      <p>
        Enter a URL from which we will extract fonts. Typically, the URL where the map will be shown
      </p>
      <p role="note">
        <FontAwesomeIcon icon={faTriangleExclamation} />&nbsp;
        Note: selecting a font this way requires that that font file extracted from the page remain
        available in the same location, meaning that if the font used on that page changes, you may
        need to update it here too
      </p>
    </SubForm>
  );
}
