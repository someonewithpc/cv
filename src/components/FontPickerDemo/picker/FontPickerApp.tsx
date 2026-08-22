import { useCallback, useEffect, useMemo, useState } from 'react';

import { setCustomCss, useFontState } from './fontState';

import { useFontFaces, type FontFaceDescriptor } from './useFontFaces';
import { useFontSize, useFontWeight } from './useFontMetrics';

import { FontSize } from './FontSize';
import { FontFamily } from './FontFamily';
import { FontWeight } from './FontWeight';

import './FontPicker.scss';

const DEFAULT_STACK = "'Poppins', system-ui, sans-serif";

function setAppFont(descriptor: { family: string, style?: string, size: string, weight: number }, registeredFontFaces: Record<string, string>) {
  const family = descriptor.family;
  const stack = family && family !== 'Poppins' ? `'${family}', ${DEFAULT_STACK}` : DEFAULT_STACK;

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

  setCustomCss(`${atFace}

/* html AND body: the layout declares --font-poppins on both, and the body
   declaration would shadow an override that only reaches :root */
:root, body {
  --font-poppins: ${stack};
  ${weightVars}
}

:root {
  font-size: ${descriptor.size};
}

body {
  font-family: ${stack};
  font-weight: ${descriptor.weight};
  font-style: ${descriptor.style ?? 'normal'};
}

b, strong {
  font-weight: var(--font-weight-bold, bold);
}`);
}

export default function FontPickerApp() {
  const { externalFontFaceDeclarations } = useFontState();

  const { fontFaces, selectedFontFace } = useFontFaces();
  const selectedFontSize = useFontSize();
  const selectedFontWeight = useFontWeight();

  const [size, setSize] = useState(selectedFontSize);
  const [weight, setWeight] = useState(Number.isNaN(selectedFontWeight) ? 400 : selectedFontWeight);
  const [dropdownDescriptor, setDropdownDescriptor] = useState<FontFaceDescriptor | undefined>(
    // The page's body copy is Poppins even though body itself never declares it,
    // so the computed-style match can't see it — seed the dropdown explicitly
    () => fontFaces.find((ff) => ff.family === 'Poppins' && ff.weight === '400') ?? selectedFontFace,
  );

  useEffect(() => {
    if (dropdownDescriptor === undefined && fontFaces.length) {
      setDropdownDescriptor(fontFaces.find((ff) => ff.family === 'Poppins' && ff.weight === '400') ?? selectedFontFace);
    }
  }, [fontFaces]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateFontSettingsCallback = useCallback((descriptor: { family?: string, style?: string, size?: string, weight?: number | string }) => {
    if (!dropdownDescriptor) return;
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
    () => fontFaces.filter((ff) => ff.family === dropdownDescriptor?.family).map((ff) => ff.weight).length === 1,
    [fontFaces, dropdownDescriptor],
  );

  if (!dropdownDescriptor) return;

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
            setDropdownDescriptor(fontFaces.find((ff) => ff.family === 'Poppins' && ff.weight === '400') ?? fontFaces[0]);
          }}
        >
          Reset page
        </button>
      </h4>

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
        selectedFontFace={dropdownDescriptor}
        setFontDescriptor={(descriptor: FontFaceDescriptor) => {
          setDropdownDescriptor(descriptor);
          updateFontSettingsCallback(descriptor);
          if (descriptor.weight) setWeight(+descriptor.weight);
        }}
      />
    </div>
  );
}
