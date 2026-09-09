import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowsRotate } from '@fortawesome/free-solid-svg-icons';

export function FontSize({ size, setSize }: { size: number, setSize: (size: number) => void }) {
  return (
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
        onChange={(e) => setSize(+e.currentTarget.value)}
      />
    </label>
  );
}
