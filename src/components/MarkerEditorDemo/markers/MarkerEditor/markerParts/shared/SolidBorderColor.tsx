import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSquare } from "@fortawesome/free-regular-svg-icons";
import { type DebouncedFunc, throttle } from "lodash";

import type { SpaceType } from '@/store';

import { MarkerPart } from "./";

export class SolidBorderColor extends MarkerPart {
  protected get borderClassName(): string {
    return 'marker-border';
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
      color: '#89ab24', // $visrez-brand
    };
  }

  Content({ space, extraProps }: { space: SpaceType, extraProps: Record<string, string> }) {
    return (
      <style {...extraProps}>
        {`#marker-${space.markerId} .${this.borderClassName} {
          --border-color: ${this.reactiveState.color};
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
        <label htmlFor="marker-border-color">Color</label>
        <input
          id="marker-border-color"
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

