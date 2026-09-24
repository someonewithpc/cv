import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowsRotate } from '@fortawesome/free-solid-svg-icons';

import { Pinned } from './Pinned';

export function FontSize({ size, setSize }: { size: number, setSize: (size: number) => void }) {
  const [interacting, setInteracting] = useState(false);

  return (
    <Pinned interacting={interacting} onLeave={() => setInteracting(false)}>
      <label>
        <span>
          <span>Font Size</span>
          <button
            type="button"
            className="reset"
            aria-label="Reset to default"
            title="Reset to default"
            onClick={() => setSize(1)}
          >
            <FontAwesomeIcon icon={faArrowsRotate} />
          </button>
        </span>
        <input
          type="range"
          data-demo-target="size"
          min="0.5"
          max="2.0"
          step={1 / 8}
          value={size}
          onChange={(e) => {
            setInteracting(true);
            setSize(+e.currentTarget.value);
          }}
          onFocus={() => setInteracting(true)}
          onBlur={() => setInteracting(false)}
        />
      </label>
    </Pinned>
  );
}
