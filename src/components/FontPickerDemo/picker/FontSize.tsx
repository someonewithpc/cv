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
          <FontAwesomeIcon
            icon={faArrowsRotate}
            onClick={() => setSize(1)}
            title="Reset to default"
            style={{ float: 'right' }}
          />
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
