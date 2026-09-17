import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import cx from 'classnames';

import type { FontFaceDescriptor } from './useFontFaces';
import { demoPicker, useDemoPicker } from './demoPicker';
import { Pinned } from './Pinned';

export type FaceOption = {
  key: string;
  label: string;
  family: string;
  weight: number | null;
  style: string;
};

// The product's two last entries: choosing one opens the matching subform instead of a face
export const ADD_GOOGLE_FONT = '-- Add new Google font --';
export const EXTRACT_FROM_URL = '-- Extract fonts from URL --';

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

function faceStyle(option: FaceOption | undefined): CSSProperties {
  if (!option) return {};
  return {
    fontFamily: option.family,
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
    /** Receives an option key, or one of the two subform sentinels */
    onChange: (key: string) => void,
    onPreview: (key: string) => void,
    onPreviewEnd: () => void,
  }
) {
  const selectRef = useRef<HTMLSelectElement>(null);
  const [previewing, setPreviewing] = useState(false);
  const [focused, setFocused] = useState(false);
  const selected = options.find((option) => option.key === value) ?? options[0];

  const stopPreviewing = () => {
    if (!previewing) return;
    setPreviewing(false);
    onPreviewEnd();
  };

  // The list as the auto-play draws it: the faces, then the two entries, in the select's order
  const entries = [
    ...options.map((option) => ({ key: option.key, label: option.label, style: faceStyle(option) })),
    ...[ADD_GOOGLE_FONT, EXTRACT_FROM_URL].map((label) => ({ key: label, label, style: { ...faceStyle(selected), fontStyle: 'italic' as const } })),
  ];

  const picker = useDemoPicker();
  useEffect(() => {
    if (!picker.open) {
      stopPreviewing();
      return;
    }
    const entry = picker.hovered === null ? undefined : entries[picker.hovered];
    if (picker.previewable && entry && options.some((option) => option.key === entry.key)) {
      setPreviewing(true);
      onPreview(entry.key);
    }
  }, [picker.open, picker.hovered]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Pinned interacting={focused || picker.open} onLeave={() => setFocused(false)}>
      <label style={faceStyle(selected)}>
        <span>Font Family</span>
        <div className={cx('select-wrapper', { 'new-dot': hasNew, 'is-demo-open': picker.open })}>
          <select
            ref={selectRef}
            className="w-100"
            data-demo-target="family"
            value={value}
            onChange={(e) => {
              // A subform entry commits no face, so a preview left from the way down ends here
              stopPreviewing();
              setFocused(false);
              onChange(e.currentTarget.value);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              stopPreviewing();
            }}
            onToggle={(e) => {
              if ((e.nativeEvent as ToggleEvent).newState === 'closed') stopPreviewing();
            }}
          >
            {options.map((option) => (
              <option
                key={option.key}
                value={option.key}
                style={faceStyle(option)}
                // Hovering previews the face on the demo; leaving without choosing puts the
                // committed one back
                onMouseEnter={() => {
                  setPreviewing(true);
                  onPreview(option.key);
                }}
              >
                {option.label}
              </option>
            ))}
            {[ADD_GOOGLE_FONT, EXTRACT_FROM_URL].map((label) => (
              <option key={label} value={label} style={{ ...faceStyle(selected), fontStyle: 'italic' }}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {picker.open && selectRef.current && createPortal(
          <DemoPickerList select={selectRef.current} entries={entries} hovered={picker.hovered} />,
          sheetOf(selectRef.current),
        )}
      </label>
    </Pinned>
  );
}

// The carousel page the select sits on, which is positioned; the sidebar has a <section> of its own
const sheetOf = (el: Element) => el.closest<HTMLElement>('article.technical-drawing-stack > * > section') ?? document.body;

// The sheet's --sheet-margin in px: a custom property comes back as written, in rem
function sheetMargin(sheet: HTMLElement) {
  const raw = getComputedStyle(sheet).getPropertyValue('--sheet-margin').trim();
  const value = parseFloat(raw);
  if (Number.isNaN(value)) return 16;
  if (raw.endsWith('rem')) return value * parseFloat(getComputedStyle(document.documentElement).fontSize);
  if (raw.endsWith('em')) return value * parseFloat(getComputedStyle(sheet).fontSize);
  return value;
}

// Drawn into the sheet beside the auto-play's cursor, so the cursor stays on top of it; the
// sidebar's own overflow would clip a list left inside it. Like the native picker it opens
// upward when the room above is the larger, and scrolls inside whatever room that is
function DemoPickerList(
  { select, entries, hovered }:
  { select: HTMLSelectElement, entries: { key: string, label: string, style: CSSProperties }[], hovered: number | null }
) {
  const rect = select.getBoundingClientRect();
  const sheet = sheetOf(select).getBoundingClientRect();
  const fontSize = parseFloat(getComputedStyle(select).fontSize);
  // The frame line sits one sheet margin in; the list keeps another inside it
  const inset = 2 * sheetMargin(sheetOf(select));
  const below = sheet.bottom - rect.bottom - inset;
  const above = rect.top - sheet.top - inset;
  const downward = below >= entries.length * fontSize * 2 || below >= above;

  return (
    <ul
      className={cx('font-picker-demo-picker', { 'is-upward': !downward })}
      aria-hidden="true"
      style={{
        left: rect.left - sheet.left,
        width: rect.width,
        fontSize,
        maxHeight: downward ? below : above,
        ...(downward ? { top: rect.bottom - sheet.top } : { bottom: sheet.bottom - rect.top }),
      }}
    >
      {entries.map((entry, index) => (
        <li
          key={entry.key}
          className={cx({ 'is-hovered': index === hovered })}
          style={entry.style}
          onPointerEnter={() => demoPicker.hover(index)}
        >
          {entry.label}
        </li>
      ))}
    </ul>
  );
}
