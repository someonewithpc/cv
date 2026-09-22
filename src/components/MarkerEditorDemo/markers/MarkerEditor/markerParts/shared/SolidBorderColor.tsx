import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSquare } from "@fortawesome/free-regular-svg-icons";
import { type DebouncedFunc, debounce } from "lodash";

import type { SpaceType } from '@/store';

import { MarkerPart } from "./";
import { ColorField } from "./ColorField";
import { CONTROL_COMMIT_MS, LiveStyleRule, keepReactOut } from "./liveStyleRule";

export class SolidBorderColor extends MarkerPart {
  protected get borderClassName(): string {
    return 'marker-border';
  }

  commitColor: DebouncedFunc<(color: string) => void>;

  paintColor = (event: Event) => {
    keepReactOut(event);
    this.setColor((event.target as HTMLInputElement).value);
  };

  /** The picker fires `change` when it closes; don't make the drag's last colour wait. */
  flushColor = (event: Event) => {
    keepReactOut(event);
    this.commitColor.flush();
  };

  private liveRule: LiveStyleRule;

  constructor(...args: any[]) {
    // @ts-ignore
    super(...args);

    this.liveRule = new LiveStyleRule(this.container, `.${this.borderClassName}`, '--border-color');
    this.commitColor = debounce((color: string) => {
      this.reactiveState.color = color;
    }, CONTROL_COMMIT_MS);
  }

  get defaultReactiveState() {
    return {
      color: '#89ab24', // $visrez-brand
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

    rule.style.setProperty('--border-color', color);
    this.reactiveState.internal.color = color;
    this.commitColor(color);
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
      <ColorField
        id={`marker-border-color-${this.borderClassName}`}
        demoTarget={`editor:border-color:${this.borderClassName}`}
        color={this.reactiveState.color}
        onInput={this.paintColor}
        onChange={this.flushColor}
      />
    );
  }

  title = 'Solid';
}

