import { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowsRotate } from '@fortawesome/free-solid-svg-icons';

import { FixedElement } from './FixedElement';

export function FontSize(
  { size, setSize }:
  { size: number, setSize: (size: number) => void }
) {
  const [isInteracting, setIsInteracting] = useState(false);
  const initialSizeRef = useRef(size);

  useEffect(() => {
    if (!isInteracting) initialSizeRef.current = size;
  }, [isInteracting]); // eslint-disable-line react-hooks/exhaustive-deps

  return (<>
    <FixedElement
      isInteracting={isInteracting}
      setIsInteracting={setIsInteracting}
    >
      <label style={{ fontSize: isInteracting ? `${1 / initialSizeRef.current}em` : '' }}>
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
          min="0.5"
          max="2.0"
          step={1 / 8}
          value={size}
          onChange={(e) => {
            setIsInteracting(true);
            setSize(+e.currentTarget.value);
          }}
          onFocus={() => setIsInteracting(true)}
          onBlur={() => setIsInteracting(false)}
        />
      </label>
    </FixedElement>
  </>);
}
