import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBorderAll } from "@fortawesome/free-solid-svg-icons";
import { type DebouncedFunc, throttle } from "lodash";

import type { SpaceType } from '@/store';

import { SolidBorder } from "./SolidBorder";

export class DashedBorder extends SolidBorder {
  protected get borderClassName(): string {
    return 'marker-border';
  }

  throttledSetDashLength: DebouncedFunc<(dashLength: number) => void>;
  throttledSetGapLength: DebouncedFunc<(gapLength: number) => void>;

  constructor(...args: any[]) {
    // @ts-ignore
    super(...args);

    this.throttledSetDashLength = throttle((dashLength: number) => {
      this.reactiveState.dashLength = dashLength;
    }, 25);

    this.throttledSetGapLength = throttle((gapLength: number) => {
      this.reactiveState.gapLength = gapLength;
    }, 25);
  }

  get defaultReactiveState() {
    return {
      ...super.defaultReactiveState,
      dashLength: 0.1,
      gapLength: 0.1,
      strokeLinecap: 'round' as 'butt' | 'round' | 'square',
    };
  }

  Content({ space, extraProps }: { space: SpaceType, extraProps: Record<string, string> }) {
    return (
      <style {...extraProps}>
        {`#marker-${space.markerId} .${this.borderClassName} {
          stroke: var(--border-color, var(--brand));
          stroke-width: ${this.reactiveState.width};
          stroke-dasharray: ${this.reactiveState.dashLength} ${this.reactiveState.gapLength};
          stroke-linecap: ${this.reactiveState.strokeLinecap};
        }`}
      </style>
    );
  }

  Thumbnail() {
    return (<FontAwesomeIcon icon={faBorderAll} />);
  }

  Configuration() {
    return (
      <>
        {super.Configuration()}
        <label htmlFor="marker-dash-length">Dash Length</label>
        <input
          id="marker-dash-length"
          type="range"
          min="0.01"
          max="1.0"
          step="0.001"
          value={this.reactiveState.dashLength}
          onChange={(e) => {
            this.throttledSetDashLength(parseFloat(e.target.value));
          }}
        />
        <label htmlFor="marker-gap-length">Gap Length</label>
        <input
          id="marker-gap-length"
          type="range"
          min="0.01"
          max="1.0"
          step="0.001"
          value={this.reactiveState.gapLength}
          onChange={(e) => {
            this.throttledSetGapLength(parseFloat(e.target.value));
          }}
        />
        <label htmlFor="marker-line-cap">Line Cap</label>
        <select
          id="marker-line-cap"
          value={this.reactiveState.strokeLinecap}
          onChange={(e) => {
            this.reactiveState.strokeLinecap = e.target.value as 'butt' | 'round' | 'square';
          }}
        >
          <option value="butt">Butt</option>
          <option value="round">Round</option>
          <option value="square">Square</option>
        </select>
      </>
    );
  }

  title = 'Dashed';
}

