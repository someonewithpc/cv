import { useCallback, useMemo, useState } from 'react';

import { setCustomCss, useFontState } from './fontState';

import { PAGE_DEFAULT_FACE, useFontFaces, type FontFaceDescriptor } from './useFontFaces';
import { useFontSize, useFontWeight } from './useFontMetrics';

import { FontSize } from './FontSize';
import { FontFamily } from './FontFamily';
import { FontWeight } from './FontWeight';
import { GoogleFont } from './GoogleFont';
import { EmbedURL } from './EmbedURL';

import './FontPicker.scss';

function isPageDefault(descriptor: { family: string }) {
  return descriptor.family === PAGE_DEFAULT_FACE.family;
}

function setAppFont(descriptor: { family: string, style?: string, size: string, weight: number }, registeredFontFaces: Record<string, string>) {
  const { family } = descriptor;
  const stack = `'${family}', ${PAGE_DEFAULT_FACE.family}`;

  const atFace = registeredFontFaces[family] || '';

  const baseWeight = descriptor.weight;

  let weightVars = '';
  if (baseWeight > 0 && !Number.isNaN(baseWeight)) {
    weightVars = Object.entries({
      'light': 300,
      'normal': 400,
      'medium': 500,
      'bold': 700,
    }).map(([name, weight]) => {
      // Scale proportionally to requested base weight, rounded to nearest 50
      // For high weights, this may go above 1000, which is acceptable
      // since the browser treats anything above 1000 as 1000
      const newWeight = Math.round((weight * baseWeight / 400) / 50) * 50;
      return `--font-weight-${name}: ${newWeight};`;
    }).join('\n  ');
  }

  const familyRules = isPageDefault(descriptor) ? '' : `${atFace}

/* html AND body: the layout declares --font-poppins on both, and the body
   declaration would shadow an override that only reaches :root */
:root, body {
  --font-poppins: ${stack};
}

/* Every proportional face on the page — prose, headings, mockups, notes — with
   !important so component-scoped rules cannot shadow it. Monospace and code stay:
   a proportional face there breaks alignment. Options keep their own preview face */
body, body :not(.monospace, .monospace *, code, pre, kbd, samp, option) {
  font-family: ${stack} !important;${descriptor.style && descriptor.style !== 'normal' ? `
  font-style: ${descriptor.style} !important;` : ''}
}`;

  setCustomCss(`${familyRules}

:root, body {
  ${weightVars}
}

:root {
  font-size: ${descriptor.size};
}

body {
  font-weight: ${descriptor.weight};
}

b, strong {
  font-weight: var(--font-weight-bold, bold);
}`);
}

export default function FontPickerApp() {
  const { externalFontFaceDeclarations } = useFontState();

  const { fontFaces: documentFontFaces } = useFontFaces();
  const fontFaces = useMemo(() => [PAGE_DEFAULT_FACE, ...documentFontFaces], [documentFontFaces]);

  const selectedFontSize = useFontSize();
  const selectedFontWeight = useFontWeight();

  const [size, setSize] = useState(selectedFontSize);
  const [weight, setWeight] = useState(Number.isNaN(selectedFontWeight) ? 400 : selectedFontWeight);
  const [dropdownDescriptor, setDropdownDescriptor] = useState<FontFaceDescriptor>(PAGE_DEFAULT_FACE);

  const updateFontSettingsCallback = useCallback((descriptor: { family?: string, style?: string, size?: string, weight?: number | string }) => {
    setAppFont(
      {
        family: dropdownDescriptor.family,
        style: dropdownDescriptor.style,
        // @ts-ignore it's definitely a number
        weight: Number(dropdownDescriptor.weight ?? weight),
        size: size + 'em',
        ...descriptor,
      },
      externalFontFaceDeclarations,
    );
  }, [externalFontFaceDeclarations, dropdownDescriptor, size, weight]);

  const enableWeightSlider = useMemo(
    () => fontFaces.filter((ff) => ff.family === dropdownDescriptor.family).length === 1,
    [fontFaces, dropdownDescriptor],
  );

  return (
    <div className="font-picker-panel font-settings">
      <h4>
        Style
        <button
          type="button"
          className="font-picker-reset"
          onClick={() => {
            setCustomCss('');
            setSize(1);
            setWeight(400);
            setDropdownDescriptor(PAGE_DEFAULT_FACE);
          }}
        >
          Reset page
        </button>
      </h4>

      <div className="font-picker-columns">
        <div className="font-picker-column">
          <FontSize
            size={size}
            setSize={(size: number) => {
              setSize(size);
              updateFontSettingsCallback({ size: size + 'em' });
            }}
          />

          <FontWeight
            enabled={enableWeightSlider}
            weight={weight}
            setWeight={(weight: number) => {
              setWeight(weight);
              updateFontSettingsCallback({ weight });

              if (fontFaces.find((ff) => ff.family === dropdownDescriptor.family && ff.weight?.toString() === weight.toString()) !== undefined) {
                setDropdownDescriptor({ ...dropdownDescriptor, weight: weight.toString() });
              }
            }}
          />

          <FontFamily
            fontFaces={fontFaces}
            selectedFontFace={dropdownDescriptor}
            setFontDescriptor={(descriptor: FontFaceDescriptor) => {
              setDropdownDescriptor(descriptor);
              updateFontSettingsCallback(descriptor);
              if (descriptor.weight) setWeight(+descriptor.weight);
            }}
          />
        </div>

        {/* The two sources used to hide behind sentinel options at the bottom of the
            dropdown; on a CV they are the part worth seeing, so they stay open */}
        <div className="font-picker-column">
          <GoogleFont visible />
          <EmbedURL visible />
        </div>
      </div>
    </div>
  );
}
