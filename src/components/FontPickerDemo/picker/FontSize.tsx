import { useId, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowsRotate } from '@fortawesome/free-solid-svg-icons/faArrowsRotate';

import { Pinned } from './Pinned';

export function FontSize({ size, setSize }: { size: number, setSize: (size: number) => void }) {
  const [interacting, setInteracting] = useState(false);
  const id = useId();

  return (
    <Pinned interacting={interacting} onLeave={() => setInteracting(false)}>
      <label htmlFor={id}>
        <span>
          <span id={`${id}-name`}>Font Size</span>
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
          id={id}
          aria-labelledby={`${id}-name`}
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
