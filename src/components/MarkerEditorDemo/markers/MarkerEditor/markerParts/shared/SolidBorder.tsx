import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSquare } from "@fortawesome/free-regular-svg-icons";
import { type DebouncedFunc, debounce } from "./debounce";

import type { SpaceType } from '../../../../store';

import { MarkerPart } from "./";
import { CONTROL_COMMIT_MS, LiveProperty, keepReactOut, markerScope } from "./liveProperty";

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

  protected liveWidth: LiveProperty;

  constructor(...args: any[]) {
    // @ts-ignore
    super(...args);

    this.liveWidth = new LiveProperty(this.container, `--live-${this.borderClassName}-border-width`);
    this.commitWidth = debounce((width: number) => {
      this.reactiveState.width = width;
    }, CONTROL_COMMIT_MS);
  }

  get defaultReactiveState() {
    return {
      width: 0.05,
    };
  }

  get liveProperties(): Record<string, string> {
    return { [this.liveWidth.name]: String(this.reactiveState.width) };
  }

  /** The colour pickers' path, for a slider: see SolidFill and `keepReactOut`. */
  protected setWidth(width: number) {
    this.liveWidth.set(width);
    this.reactiveState.internal.width = width;
    this.commitWidth(width);
  }

  Content({ space, extraProps, live }: { space: SpaceType, extraProps: Record<string, string>, live?: boolean }) {
    return (
      <style {...extraProps}>
        {`${markerScope(space.markerId, live)} .${this.borderClassName} {
          stroke: var(--border-color, var(--brand));
          stroke-width: ${this.liveWidth.css(this.reactiveState.width, live)};
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

