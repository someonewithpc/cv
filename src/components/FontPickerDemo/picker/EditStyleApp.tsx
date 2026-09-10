import { useEffect, useMemo, useRef, useState } from 'react';

import { DEFAULT_FAMILY, commitOverride, endPreview, previewOverride, registerExternalFaces, resetOverride, useFontOverride } from './fontOverride';
import { useFontFaces } from './useFontFaces';
import type { LoadedFaces } from './sources';

import { Specimen } from './Specimen';
import { Autoplay } from './Autoplay';
import { FontSize } from './FontSize';
import { FontWeight } from './FontWeight';
import { ADD_GOOGLE_FONT, EXTRACT_FROM_URL, FontFamily, toOption, type FaceOption } from './FontFamily';
import { GoogleFont } from './GoogleFont';
import { EmbedURL } from './EmbedURL';

import './EditStyle.scss';

type SubFormName = 'google' | 'embed' | null;

export default function EditStyleApp() {
  const rootRef = useRef<HTMLDivElement>(null);
  const { fontFaces } = useFontFaces();
  const { committed, externalFaces } = useFontOverride();

  const options = useMemo(() => fontFaces.map(toOption), [fontFaces]);

  // Opens on the face the demo already wears, as the product's does on the map's
  const defaultKey = (options.find((o) => o.family === DEFAULT_FAMILY && o.weight === 400) ?? options[0])?.key ?? '';
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = options.find((option) => option.key === (selectedKey ?? defaultKey)) ?? options[0];

  // The two subforms are behind the dropdown's last entries, as in the product
  const [visibleSubForm, setVisibleSubForm] = useState<SubFormName>(null);

  // The dot on the dropdown marks faces that arrived from a subform since it was last used
  const externalCount = Object.keys(externalFaces).length;
  const [seenExternalCount, setSeenExternalCount] = useState(externalCount);

  const overrideFor = (option: FaceOption, weight: number | null) => ({
    family: option.family,
    style: option.style,
    // A fixed-weight face brings its weight; a variable one keeps the slider's
    weight: option.weight ?? weight,
  });

  const select = (key: string) => {
    setSeenExternalCount(externalCount);

    if (key === ADD_GOOGLE_FONT) return setVisibleSubForm('google');
    if (key === EXTRACT_FROM_URL) return setVisibleSubForm('embed');

    const option = options.find((o) => o.key === key);
    if (!option) return;
    setVisibleSubForm(null);
    setSelectedKey(key);
    commitOverride(overrideFor(option, committed.weight));
  };

  // A subform's first loaded family goes on the demo as soon as document.fonts lists it
  const [pendingFamily, setPendingFamily] = useState<string | null>(null);
  useEffect(() => {
    if (pendingFamily === null) return;
    const option = options.find((o) => o.family === pendingFamily);
    if (!option) return;
    setPendingFamily(null);
    setSelectedKey(option.key);
    commitOverride(overrideFor(option, committed.weight));
  }, [options, pendingFamily]); // eslint-disable-line react-hooks/exhaustive-deps

  const adopt = (faces: LoadedFaces) => {
    registerExternalFaces(faces);
    const [first] = Object.keys(faces);
    if (first) setPendingFamily(first);
    return faces;
  };

  // The slider only means something when the family has one face to weigh
  const weightIsFree = selected !== undefined && options.filter((o) => o.family === selected.family).length === 1;

  return (
    <div className="edit-style" ref={rootRef}>
      <aside className="sidebar">
        <nav>
          <section className="edit-settings">
            <ul>
              <li className="style font-settings">
                <FontSize
                  size={committed.size}
                  setSize={(size) => commitOverride({ size })}
                />

                <FontWeight
                  enabled={weightIsFree}
                  weight={committed.weight ?? 400}
                  setWeight={(weight) => {
                    // Landing on a weight the family ships as its own face selects that face
                    const face = selected && options.find((o) => o.family === selected.family && o.weight === weight);
                    if (face) setSelectedKey(face.key);
                    commitOverride({ weight });
                  }}
                />

                <FontFamily
                  options={options}
                  value={selected?.key ?? ''}
                  hasNew={externalCount > seenExternalCount}
                  onChange={select}
                  onPreview={(key) => {
                    const option = options.find((o) => o.key === key);
                    if (option) previewOverride(overrideFor(option, committed.weight));
                  }}
                  onPreviewEnd={endPreview}
                />

                <GoogleFont visible={visibleSubForm === 'google'} onLoaded={adopt} />
                <EmbedURL visible={visibleSubForm === 'embed'} onLoaded={adopt} />
              </li>
            </ul>
            <footer>
              <input
                type="button"
                value="Reset"
                data-demo-target="reset"
                onClick={() => {
                  resetOverride();
                  setSelectedKey(null);
                  setVisibleSubForm(null);
                }}
              />
            </footer>
          </section>
        </nav>
      </aside>

      <Specimen />

      <Autoplay root={rootRef} />
    </div>
  );
}
