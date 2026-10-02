import { useEffect, useState } from 'react';

import { type SpaceType } from '@/store';

import { MarkerPart } from '../shared';

import './DecorationFont.scss';

const NO_FONT_FACES: Record<string, string> = {};

export type FontFaceDescriptor = {
  family: string;
  style?: string;
  weight?: number | string;
  size?: string;
};

const DEMO_FONTS = [
  { family: 'Poppins', weight: '400' },
  { family: 'system-ui', weight: '400' },
  { family: 'Georgia', weight: '400' },
  { family: 'monospace', weight: '400' },
];

export class DecorationFont extends MarkerPart {
  get defaultReactiveState() {
    return {
      fontDescriptor: { family: 'Poppins', weight: 600 } as FontFaceDescriptor | undefined,
      registeredFontFaces: {} as Record<string, string>,
    };
  }

  get reactiveStateStoreHandler() {
    return {
      get registeredFontFaces() {
        // One shared object: a fresh {} per read is a new value on every dispatch.
        return NO_FONT_FACES;
      },
    };
  }

  Content({ space, extraProps }: { space: SpaceType; extraProps: Record<string, string> }) {
    if (!this.reactiveState.fontDescriptor) {
      return <g {...extraProps} />;
    }

    const fontFaceRule = this.reactiveState.registeredFontFaces[this.reactiveState.fontDescriptor.family] ?? '';
    const fontProperties = Object.entries(this.reactiveState.fontDescriptor)
      .map(([prop, value]) => `font-${prop}: ${value};`)
      .join('\n  ');

    return (
      <style {...extraProps} id={`marker-${space.markerId}-decoration-font`}>
        {`${fontFaceRule ?? ''}\n\n#marker-${space.markerId} .marker-decoration {\n  ${fontProperties}\n}`}
      </style>
    );
  }

  Thumbnail() {
    return null;
  }

  Configuration({ space: _ }: { space: SpaceType }) {
    return (
      <div className="font-settings">
        <DecorationFontConfiguration
          fontDescriptor={this.reactiveState.fontDescriptor}
          setFontDescriptor={(fontDescriptor: FontFaceDescriptor | undefined) => {
            this.reactiveState.fontDescriptor = fontDescriptor;
          }}
        />
      </div>
    );
  }

  title = 'Font';
}

function DecorationFontConfiguration({
  fontDescriptor,
  setFontDescriptor,
}: {
  fontDescriptor: FontFaceDescriptor | undefined;
  setFontDescriptor: (fontDescriptor: FontFaceDescriptor | undefined) => void;
}) {
  const [weight, setWeight] = useState(600);

  useEffect(() => {
    if (!fontDescriptor) {
      setFontDescriptor({ family: 'Poppins', weight: 600 });
    }
  }, [fontDescriptor, setFontDescriptor]);

  return (
    <>
      <label htmlFor="marker-font-family">Family</label>
      <select
        id="marker-font-family"
        value={fontDescriptor?.family ?? 'Poppins'}
        onChange={(e) => {
          setFontDescriptor({
            family: e.target.value,
            weight,
          });
        }}
      >
        {DEMO_FONTS.map((font) => (
          <option key={`${font.family}-${font.weight}`} value={font.family}>
            {font.family}
          </option>
        ))}
      </select>

      <label htmlFor="marker-font-weight">Weight</label>
      <input
        id="marker-font-weight"
        type="range"
        min={100}
        max={900}
        step={100}
        value={weight}
        onChange={(e) => {
          const next = Number(e.target.value);
          setWeight(next);
          setFontDescriptor({
            family: fontDescriptor?.family ?? 'Poppins',
            weight: next,
          });
        }}
      />
    </>
  );
}
