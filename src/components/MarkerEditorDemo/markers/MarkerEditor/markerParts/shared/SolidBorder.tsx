import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSquare } from "@fortawesome/free-regular-svg-icons";
import { type DebouncedFunc, debounce } from "lodash";

import type { SpaceType } from '../../../../store';

import { MarkerPart } from "./";
import { CONTROL_COMMIT_MS, LiveStyleRule, keepReactOut } from "./liveStyleRule";

export class SolidBorder extends MarkerPart {
  protected get borderClassName(): string {
    return 'marker-border';
  }

  commitWidth: DebouncedFunc<(width: number) => void>;

  paintWidth = (event: Event) => {
    keepReactOut(event);
    this.setWidth(parseFloat((event.target as HTMLInputElement).value));
  };

  flushWidth = (event: Event) => {
    keepReactOut(event);
    this.commitWidth.flush();
  };

  protected liveRule: LiveStyleRule;

  constructor(...args: any[]) {
    // @ts-ignore
    super(...args);

    this.liveRule = new LiveStyleRule(this.container, `.${this.borderClassName}`, 'stroke-width');
    this.commitWidth = debounce((width: number) => {
      this.reactiveState.width = width;
    }, CONTROL_COMMIT_MS);
  }

  get defaultReactiveState() {
    return {
      width: 0.05,
    };
  }

  /** The colour pickers' path, for a slider: see SolidFill and `keepReactOut`. */
  protected setWidth(width: number) {
    const rule = this.liveRule.get();
    if (!rule) {
      this.reactiveState.width = width;
      return;
    }

    rule.style.setProperty('stroke-width', String(width));
    this.reactiveState.internal.width = width;
    this.commitWidth(width);
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
          data-demo-target="editor:border-width"
          ref={(input) => {
            if (!input) return;
            input.value = String(this.reactiveState.width);
            input.addEventListener('input', this.paintWidth);
            input.addEventListener('change', this.flushWidth);
          }}
        />
      </>
    );
  }

  title = 'Solid';
}

