import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowsRotate } from '@fortawesome/free-solid-svg-icons';

export function FontWeight(
  { enabled, weight, setWeight }:
  { enabled: boolean, weight: number, setWeight: (weight: number) => void }
) {
  return (
    <label
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
        data-demo-target="weight"
        min="100"
        max="1000"
        step={100}
        value={weight}
        onChange={(e) => setWeight(+e.currentTarget.value)}
      />
    </label>
  );
}
