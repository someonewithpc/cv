import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSquare } from "@fortawesome/free-regular-svg-icons";
import { type DebouncedFunc, debounce } from "lodash";

import type { SpaceType } from '@/store';

import { MarkerPart } from "./";
import { COLOR_COMMIT_MS, LiveStyleRule } from "./liveStyleRule";

export class SolidFill extends MarkerPart {
  protected get fillClassName(): string {
    return 'marker-fill';
  }

  commitColor: DebouncedFunc<(color: string) => void>;

  /** The picker fires `change` when it closes; don't make the drag's last colour wait. */
  flushColor = () => {
    this.commitColor.flush();
  };

  private liveRule: LiveStyleRule;

  constructor(...args: any[]) {
    // @ts-ignore
    super(...args);

    this.liveRule = new LiveStyleRule(this.container, `.${this.fillClassName}`, 'fill');
    this.commitColor = debounce((color: string) => {
      this.reactiveState.color = color;
    }, COLOR_COMMIT_MS);
  }

  get defaultReactiveState() {
    return {
      color: '#ffffff', // white
    };
  }

  /**
   * Paint the drag straight onto the live rule and notify subscribers only once it settles.
   * Writing `internal` keeps the input's value and the serialized marker current meanwhile,
   * without a re-render.
   */
  protected setColor(color: string) {
    const rule = this.liveRule.get();
    if (!rule) {
      this.reactiveState.color = color;
      return;
    }

    rule.style.setProperty('fill', color);
    rule.style.setProperty('color', color);
    this.reactiveState.internal.color = color;
    this.commitColor(color);
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
    const inputId = `marker-fill-color-${this.fillClassName}`;
    return (
      <>
        <label htmlFor={inputId}>Color</label>
        <input
          id={inputId}
          type="color"
          data-demo-target={`editor:fill-color:${this.fillClassName}`}
          // Uncontrolled, and synced on render instead: React restores a controlled value
          // to the last rendered colour after every event, which pulls the open picker's
          // own selection backwards mid-drag.
          defaultValue={this.reactiveState.color}
          ref={(input) => {
            if (!input) return;
            input.value = this.reactiveState.color;
            input.addEventListener('change', this.flushColor);
          }}
          onChange={(e) => {
            this.setColor(e.target.value);
          }}
        />
      </>
    );
  }

  title = 'Solid';
}

