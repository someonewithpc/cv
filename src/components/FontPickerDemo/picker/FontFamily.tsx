import { useState } from 'react';
import cx from 'classnames';

import { PAGE_DEFAULT_FACE, type FontFaceDescriptor } from './useFontFaces';
import { useFontState } from './fontState';
import { FixedElement } from './FixedElement';

function fontFaceToStyle(ff: FontFaceDescriptor) {
  return Object.fromEntries(Object.entries(ff)
    .map(([prop, value]) => [
      `font${(prop[0].toUpperCase() + prop.slice(1))}`,
      value,
    ]));
}

function displayFontFace(ff: FontFaceDescriptor) {
  if (ff.family === PAGE_DEFAULT_FACE.family) return 'Page default · sans-serif';
  return Object.values(ff).filter((val) => val !== 'normal').join(' ');
}

export function FontFamily(
  { fontFaces, selectedFontFace, setFontDescriptor }:
  { fontFaces: FontFaceDescriptor[], selectedFontFace: FontFaceDescriptor, setFontDescriptor: (selectedFontFace: FontFaceDescriptor) => void }
) {
  const [isInteracting, setIsInteracting] = useState(false);
  const [selectedFontFaceBeforeHover, setSelectedFontFaceBeforeHover] = useState<FontFaceDescriptor | null>(null);

  // The dot marks faces that arrived from a source form since the dropdown was last
  // used — counted from the source registrations, so the page's own fonts finishing
  // their load cannot trigger it
  const externalFamilyCount = Object.keys(useFontState().externalFontFaceDeclarations).length;
  const [seenExternalFamilyCount, setSeenExternalFamilyCount] = useState(externalFamilyCount);
  const haveNewFontFaces = externalFamilyCount > seenExternalFamilyCount;

  if (!fontFaces.length) return;

  return (
    <FixedElement
      isInteracting={isInteracting}
      setIsInteracting={setIsInteracting}
    >
      <label style={fontFaceToStyle(selectedFontFaceBeforeHover ?? selectedFontFace)}>
        <span>Font Family</span>
        <div
          className={cx("select-wrapper", { 'new-dot': haveNewFontFaces })}
        >
          <select
            className="w-100"
            value={JSON.stringify(selectedFontFace)}
            onChange={(e) => {
              setSeenExternalFamilyCount(externalFamilyCount);
              setSelectedFontFaceBeforeHover(null);
              setIsInteracting(false);

              const descriptor: FontFaceDescriptor = JSON.parse(e.currentTarget.value);
              setFontDescriptor(descriptor);
            }}
            onFocus={() => {
              setIsInteracting(true);
            }}
            onBlur={() => {
              if (selectedFontFaceBeforeHover !== null) {
                setFontDescriptor(selectedFontFaceBeforeHover);
              }
              setIsInteracting(false);
            }}
          >
            {fontFaces.map((ff) => (
              <option
                key={JSON.stringify(ff)}
                value={JSON.stringify(ff)}
                onMouseEnter={(e) => {
                  if (selectedFontFaceBeforeHover === null) {
                    setSelectedFontFaceBeforeHover(selectedFontFace);
                  }

                  const descriptor: FontFaceDescriptor = JSON.parse(e.currentTarget.value);
                  setFontDescriptor(descriptor);
                }}
                style={fontFaceToStyle(ff)}
              >
                {displayFontFace(ff)}
              </option>
            ))}
          </select>
        </div>
      </label>
    </FixedElement>
  );
}
