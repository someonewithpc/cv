import { useState } from 'react';
import cx from 'classnames';

import type { FontFaceDescriptor } from './useFontFaces';

export type FaceOption = {
  key: string;
  label: string;
  family: string | null;
  weight: number | null;
  style: string;
};

// The page's prose is plain sans-serif; Poppins only lives inside the product mockups.
// It is not a FontFace, so the list gets a synthetic first entry meaning "no override"
export const PAGE_DEFAULT: FaceOption = { key: 'page-default', label: 'Page default', family: null, weight: null, style: 'normal' };

// A range ("100 1000") is a variable face, which the weight slider can drive
function faceWeight(weight: string): number | null {
  if (weight === 'normal') return 400;
  if (weight === 'bold') return 700;
  const numbers = weight.trim().split(/\s+/).map(Number);
  return numbers.length === 1 && !Number.isNaN(numbers[0]) ? numbers[0] : null;
}

export function toOption(face: FontFaceDescriptor): FaceOption {
  return {
    key: JSON.stringify(face),
    label: [face.family, face.weight.replace(/^(\d+) (\d+)$/, '$1–$2'), face.style]
      .filter((value) => value && value !== 'normal')
      .join(' '),
    family: face.family,
    weight: faceWeight(face.weight),
    style: face.style,
  };
}

function faceStyle(option: FaceOption) {
  return {
    fontFamily: option.family ?? 'sans-serif',
    fontWeight: option.weight ?? 400,
    fontStyle: option.style,
  };
}

export function FontFamily(
  { options, value, hasNew, onChange, onPreview, onPreviewEnd }:
  {
    options: FaceOption[],
    value: string,
    hasNew: boolean,
    onChange: (key: string) => void,
    onPreview: (key: string) => void,
    onPreviewEnd: () => void,
  }
) {
  const [previewing, setPreviewing] = useState(false);
  const selected = options.find((option) => option.key === value) ?? PAGE_DEFAULT;

  const stopPreviewing = () => {
    if (!previewing) return;
    setPreviewing(false);
    onPreviewEnd();
  };

  return (
    <label style={faceStyle(selected)}>
      <span>Font Family</span>
      <div className={cx('select-wrapper', { 'new-dot': hasNew })}>
        <select
          className="w-100"
          value={value}
          onChange={(e) => {
            setPreviewing(false);
            onChange(e.currentTarget.value);
          }}
          onBlur={stopPreviewing}
          onToggle={(e) => {
            if ((e.nativeEvent as ToggleEvent).newState === 'closed') stopPreviewing();
          }}
        >
          {options.map((option) => (
            <option
              key={option.key}
              value={option.key}
              style={faceStyle(option)}
              // Hovering previews the face on the whole page; leaving without choosing
              // puts the committed one back
              onMouseEnter={() => {
                setPreviewing(true);
                onPreview(option.key);
              }}
            >
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </label>
  );
}
