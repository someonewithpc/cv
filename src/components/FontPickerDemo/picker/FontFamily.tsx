import { useEffect, useState } from 'react';
import cx from 'classnames';

import { type FontFaceDescriptor } from './useFontFaces';
import { EmbedURL } from './EmbedURL';
import { GoogleFont } from './GoogleFont';
import { FixedElement } from './FixedElement';

const ADD_NEW_FONT_LABEL = '-- Add new Google font --';
const EXTRACT_FONT_FROM_URL_LABEL = '-- Extract fonts from URL --';

function fontFaceToStyle(ff: FontFaceDescriptor) {
  return Object.fromEntries(Object.entries(ff)
    .map(([prop, value]) => [
      `font${(prop[0].toUpperCase() + prop.slice(1))}`,
      value,
    ]));
}

function displayFontFace(ff: FontFaceDescriptor) {
  return Object.values(ff).filter((val) => val !== 'normal').join(' ');
}

export function FontFamily(
  { fontFaces, selectedFontFace, setFontDescriptor }:
  { fontFaces: FontFaceDescriptor[], selectedFontFace: FontFaceDescriptor, setFontDescriptor: (selectedFontFace: FontFaceDescriptor) => void }
) {
  const [visibleSubForm, setVisibleSubForm] = useState<'embed' | 'google' | undefined>(undefined);
  const [isInteracting, setIsInteracting] = useState(false);
  const [selectedFontFaceBeforeHover, setSelectedFontFaceBeforeHover] = useState<FontFaceDescriptor | null>(null);

  const [{ old: oldFontFaceCount, new: newFontFaceCount }, setFontFaceCount] = useState({ old: fontFaces.length, new: fontFaces.length });
  useEffect(() => {
    if (visibleSubForm !== undefined) // Prevent showing dot when only the default fonts load
      setFontFaceCount({ old: newFontFaceCount, new: fontFaces.length });
  }, [fontFaces.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const haveNewFontFaces = oldFontFaceCount !== newFontFaceCount;
  const resetHaveNewFontFaces = () => {
    setFontFaceCount({ old: fontFaces.length, new: fontFaces.length });
  };

  if (!fontFaces.length) return;

  return (
    <>
      <FixedElement
        isInteracting={isInteracting}
        setIsInteracting={setIsInteracting}
      >
        <label style={fontFaceToStyle(selectedFontFaceBeforeHover ?? selectedFontFace)}>
          <span>Font Family</span>
          <div
            className={cx('select-wrapper', { 'new-dot': haveNewFontFaces })}
          >
            <select
              className="w-100"
              value={JSON.stringify(selectedFontFace)}
              onChange={(e) => {
                resetHaveNewFontFaces();
                setSelectedFontFaceBeforeHover(null);
                setIsInteracting(false);

                switch (e.currentTarget.value) {
                  case ADD_NEW_FONT_LABEL: {
                    setVisibleSubForm('google');
                    break;
                  }
                  case EXTRACT_FONT_FROM_URL_LABEL: {
                    setVisibleSubForm('embed');
                    break;
                  }
                  default: {
                    setVisibleSubForm(undefined);
                    const descriptor: FontFaceDescriptor = JSON.parse(e.currentTarget.value);
                    setFontDescriptor(descriptor);
                    break;
                  }
                }
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
              <option
                value={ADD_NEW_FONT_LABEL}
                style={{
                  ...fontFaceToStyle(selectedFontFaceBeforeHover ?? selectedFontFace),
                  fontStyle: 'italic',
                }}
              >
                {ADD_NEW_FONT_LABEL}
              </option>
              <option
                value={EXTRACT_FONT_FROM_URL_LABEL}
                style={{
                  ...fontFaceToStyle(selectedFontFaceBeforeHover ?? selectedFontFace),
                  fontStyle: 'italic',
                }}
              >
                {EXTRACT_FONT_FROM_URL_LABEL}
              </option>
            </select>
          </div>
        </label>
      </FixedElement>

      <EmbedURL visible={visibleSubForm === 'embed'} />
      <GoogleFont visible={visibleSubForm === 'google'} />
    </>
  );
}
