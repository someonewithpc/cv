import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSquare } from "@fortawesome/free-regular-svg-icons";
import { type DebouncedFunc, throttle } from "lodash";

import type { SpaceType } from '@/store';

import { MarkerPart } from "./";

export class SolidBorder extends MarkerPart {
  protected get borderClassName(): string {
    return 'marker-border';
  }

  throttledSetWidth: DebouncedFunc<(width: number) => void>;

  constructor(...args: any[]) {
    // @ts-ignore
    super(...args);

    this.throttledSetWidth = throttle((width: number) => {
      this.reactiveState.width = width;
    }, 25);
  }

  get defaultReactiveState() {
    return {
      width: 0.05,
    };
  }

  Content({ space, extraProps }: { space: SpaceType, extraProps: Record<string, string> }) {
    return (
      <style {...extraProps}>
        {`#marker-${space.markerId} .${this.borderClassName} {
          stroke: var(--border-color, var(--brand));
          stroke-width: ${this.reactiveState.width};
          stroke-dasharray: none;
        }`}
      </style>
    );
  }

  Thumbnail() {
    return (<FontAwesomeIcon icon={faSquare} />);
  }

  Configuration() {
    return (
      <>
        <label htmlFor="marker-border-width">Width</label>
        <input
          id="marker-border-width"
          type="range"
          min="0.0"
          max="0.5"
          step="0.001"
          value={this.reactiveState.width}
          onChange={(e) => {
            this.throttledSetWidth(parseFloat(e.target.value));
          }}
        />
      </>
    );
  }

  title = 'Solid';
}

