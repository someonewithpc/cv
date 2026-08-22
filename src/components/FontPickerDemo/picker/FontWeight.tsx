import { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowsRotate } from '@fortawesome/free-solid-svg-icons';

import { FixedElement } from './FixedElement';

export function FontWeight(
  { enabled, weight, setWeight }:
  { enabled: boolean, weight: number, setWeight: (weight: number) => void }
) {
  const [isInteracting, setIsInteracting] = useState(false);
  const initialWeightRef = useRef(weight);

  useEffect(() => {
    if (!isInteracting) initialWeightRef.current = weight;
  }, [isInteracting]); // eslint-disable-line react-hooks/exhaustive-deps

  return (<>
    <FixedElement
      isInteracting={isInteracting}
      setIsInteracting={setIsInteracting}
    >
      <label
        style={{ fontWeight: isInteracting ? `${initialWeightRef.current}` : '' }}
        title={enabled
             ? 'Select font weight. Note that different weights may not be supported by the selected font'
             : 'Font weight is not available because this font only provides specific weights. Use the dropdown below'
        }
      >
        <span>
          <span>Font Weight</span>
          <FontAwesomeIcon
            icon={faArrowsRotate}
            onClick={() => setWeight(400)}
            title="Reset to default"
            style={{ float: 'right' }}
          />
        </span>
        <input
          disabled={!enabled}
          type="range"
          min="100"
          max="1000"
          step={100}
          value={Number.isNaN(weight) ? 400 : weight}
          onChange={(e) => {
            setIsInteracting(true);
            setWeight(+e.currentTarget.value);
          }}
          onFocus={() => setIsInteracting(true)}
          onBlur={() => setIsInteracting(false)}
        />
      </label>
    </FixedElement>
  </>);
}
