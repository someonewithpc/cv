import { useId } from 'react';

import { loadGoogleFont, type LoadedFaces } from './sources';
import { SubForm, useSubFormInput } from './SubForm';

export function GoogleFont({ onLoaded }: { onLoaded: (faces: LoadedFaces) => void }) {
  const id = useId();
  const { raw, setRaw, status } = useSubFormInput('google', (family, signal) => loadGoogleFont(family, signal).then(onLoaded));

  return (
    <SubForm status={status}>
      <label htmlFor={id}>Google Font</label>
      <input
        id={id}
        className="w-100"
        type="text"
        value={raw}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => setRaw(e.currentTarget.value)}
      />
      <p>
        Enter a name of a font that can be found on&nbsp;
        <a
          href="https://fonts.google.com/"
          target="_blank"
          rel="noreferrer"
        >Google Fonts</a>
      </p>
    </SubForm>
  );
}
