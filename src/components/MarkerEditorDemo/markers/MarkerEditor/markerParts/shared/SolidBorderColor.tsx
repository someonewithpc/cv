import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSquare } from "@fortawesome/free-regular-svg-icons";
import { type DebouncedFunc, debounce } from "./debounce";

import type { SpaceType } from '../../../../store';

import { MarkerPart } from "./";
import { ColorField } from "./ColorField";
import { CONTROL_COMMIT_MS, LiveProperty, keepReactOut, markerScope } from "./liveProperty";

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

  private liveColor: LiveProperty;

  constructor(...args: any[]) {
    // @ts-ignore
    super(...args);

    this.liveColor = new LiveProperty(this.container, `--live-${this.borderClassName}-border-color`);
    this.commitColor = debounce((color: string) => {
      this.reactiveState.color = color;
    }, CONTROL_COMMIT_MS);
  }

  get defaultReactiveState() {
    return {
      color: '#89ab24', // $visrez-brand
    };
  }

  get liveProperties() {
    return { [this.liveColor.name]: this.reactiveState.color };
  }

  /**
   * Paint the drag straight onto the preview and notify subscribers only once it settles.
   * Writing `internal` keeps the input's value and the serialized marker current meanwhile,
   * without a re-render.
   */
  protected setColor(color: string) {
    this.liveColor.set(color);
    this.reactiveState.internal.color = color;
    this.commitColor(color);
  }

  Content({ space, extraProps, live }: { space: SpaceType, extraProps: Record<string, string>, live?: boolean }) {
    return (
      <style {...extraProps}>
        {`${markerScope(space.markerId, live)} .${this.borderClassName} {
          --border-color: ${this.liveColor.css(this.reactiveState.color, live)};
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

