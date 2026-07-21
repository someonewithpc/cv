import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSquare } from "@fortawesome/free-regular-svg-icons";
import { type DebouncedFunc, throttle } from "lodash";

import type { SpaceType } from '@/store';

import { MarkerPart } from "./";

export class SolidFill extends MarkerPart {
  protected get fillClassName(): string {
    return 'marker-fill';
  }

  throttledSetColor: DebouncedFunc<(color: string) => void>;

  constructor(...args: any[]) {
    // @ts-ignore
    super(...args);

    this.throttledSetColor = throttle((color: string) => {
      this.reactiveState.color = color;
    }, 25);
  }

  get defaultReactiveState() {
    return {
      color: '#ffffff', // white
    };
  }

  Content({ space, extraProps }: { space: SpaceType, extraProps: Record<string, string> }) {
    return (
      <style {...extraProps}>
        {`#marker-${space.markerId} .${this.fillClassName} {
          fill: ${this.reactiveState.color};
          color: ${this.reactiveState.color};
        }`}
      </style>
    );
  }

  Thumbnail() {
    return (<FontAwesomeIcon icon={faSquare} color={this.reactiveState.color} />);
  }

  Configuration() {
    return (
      <>
        <label htmlFor="marker-fill-color">Color</label>
        <input
          id="marker-fill-color"
          type="color"
          value={this.reactiveState.color}
          onChange={(e) => {
            this.throttledSetColor(e.target.value);
          }}
        />
      </>
    );
  }

  title = 'Solid';
}

