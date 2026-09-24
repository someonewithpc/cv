import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowDown19 } from "@fortawesome/free-solid-svg-icons";

import $store, { spaceGlobalOrderSelector } from '@/store';
import type { SpaceType } from '@/store';

import { TextMarkerDecoration } from "./TextMarkerDecoration";

export class SpaceNumberMarkerDecoration extends TextMarkerDecoration {
  get defaultReactiveState() {
    return {
      spaceNumberOffset: 0,
    };
  }

  spaceNumber(space: SpaceType) {
    return spaceGlobalOrderSelector($store.getState())[space.id] + 1 + (this.reactiveState.spaceNumberOffset ?? 0);
  }

  textContent(space: SpaceType): string {
    return this.spaceNumber(space).toString();
  }

  Thumbnail() {
    return (
      <FontAwesomeIcon icon={faArrowDown19} />
    );
  }

  // Rendered as a component (markerParts/index.ts binds it), so hooks are allowed here.
  Configuration({ space: _ }: { space: SpaceType }) {
    const offset = this.reactiveState.spaceNumberOffset ?? 0;
    // The field holds the visitor's own text while it has focus. A number is only committed
    // once the text is one, so a lone minus or an emptied field stays as typed instead of
    // being read as 0 and written back over it, which is what kept a negative offset from
    // ever being entered. Out of focus the field follows the stored offset, so Reset, undo
    // and a marker loaded into the editor all show through.
    const [text, setText] = useState(String(offset));
    const [focused, setFocused] = useState(false);
    useEffect(() => {
      if (!focused) setText(String(offset));
    }, [offset, focused]);

    return (
      <>
        <label htmlFor="marker-space-number-offset">Number Offset</label>
        <input
          id="marker-space-number-offset"
          type="number"
          step={1}
          value={text}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setText(String(this.reactiveState.spaceNumberOffset ?? 0));
          }}
          onChange={(e) => {
            setText(e.target.value);
            const parsed = parseInt(e.target.value, 10);
            if (Number.isInteger(parsed)) this.reactiveState.spaceNumberOffset = parsed;
          }}
        />
      </>
    );
  }

  title = 'Space Number';
}
