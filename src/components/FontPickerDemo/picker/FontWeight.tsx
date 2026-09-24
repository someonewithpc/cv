import { useId, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowsRotate } from '@fortawesome/free-solid-svg-icons';

import { Pinned } from './Pinned';

export function FontWeight(
  { enabled, weight, setWeight }:
  { enabled: boolean, weight: number, setWeight: (weight: number) => void }
) {
  const [interacting, setInteracting] = useState(false);
  const id = useId();

  return (
    <Pinned interacting={interacting} onLeave={() => setInteracting(false)}>
      <label
        htmlFor={id}
        title={enabled
          ? 'Select font weight. Note that different weights may not be supported by the selected font'
          : 'Font weight is not available because this font only provides specific weights. Use the dropdown below'
        }
      >
        <span>
          <span id={`${id}-name`}>Font Weight</span>
          <button
            type="button"
            className="reset"
            aria-label="Reset to default"
            title="Reset to default"
            onClick={() => setWeight(400)}
          >
            <FontAwesomeIcon icon={faArrowsRotate} />
          </button>
        </span>
        <input
          id={id}
          aria-labelledby={`${id}-name`}
          disabled={!enabled}
          type="range"
          data-demo-target="weight"
          min="100"
          max="1000"
          step={100}
          value={weight}
          onChange={(e) => {
            setInteracting(true);
            setWeight(+e.currentTarget.value);
          }}
          onFocus={() => setInteracting(true)}
          onBlur={() => setInteracting(false)}
        />
      </label>
    </Pinned>
  );
}
