import { useId } from 'react';

import { loadGoogleFont, type LoadedFaces } from './sources';
import { SubForm, useSubFormInput } from './SubForm';

export function GoogleFont({ visible, onLoaded }: { visible: boolean, onLoaded: (faces: LoadedFaces) => void }) {
  const id = useId();
  const { raw, setRaw, notEmpty, status } = useSubFormInput('google', loadGoogleFont, onLoaded);

  return (
    <SubForm visible={visible} notEmpty={notEmpty} status={status}>
      <label htmlFor={id}>Font Family</label>
      <input
        id={id}
        className="w-100"
        data-demo-target="google"
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
          style={{ color: 'var(--sidebar-link)' }}
        >Google Fonts</a>
      </p>
    </SubForm>
  );
}
