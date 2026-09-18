import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBorderAll } from "@fortawesome/free-solid-svg-icons";
import { type DebouncedFunc, debounce } from "lodash";

import type { SpaceType } from '@/store';

import { SolidBorder } from "./SolidBorder";
import { CONTROL_COMMIT_MS, keepReactOut } from "./liveStyleRule";

export class DashedBorder extends SolidBorder {
  protected get borderClassName(): string {
    return 'marker-border';
  }

  commitDash: DebouncedFunc<() => void>;

  paintDashLength = (event: Event) => {
    keepReactOut(event);
    this.setDash(parseFloat((event.target as HTMLInputElement).value), this.reactiveState.gapLength);
  };

  paintGapLength = (event: Event) => {
    keepReactOut(event);
    this.setDash(this.reactiveState.dashLength, parseFloat((event.target as HTMLInputElement).value));
  };

  flushDash = (event: Event) => {
    keepReactOut(event);
    this.commitDash.flush();
  };

  constructor(...args: any[]) {
    // @ts-ignore
    super(...args);

    this.commitDash = debounce(() => {
      this.reactiveState.dashLength = this.reactiveState.internal.dashLength;
      this.reactiveState.gapLength = this.reactiveState.internal.gapLength;
    }, CONTROL_COMMIT_MS);
  }

  get defaultReactiveState() {
    return {
      ...super.defaultReactiveState,
      dashLength: 0.1,
      gapLength: 0.1,
      strokeLinecap: 'round' as 'butt' | 'round' | 'square',
    };
  }

  /** Both lengths live in one `stroke-dasharray`, so either slider writes the pair. */
  protected setDash(dashLength: number, gapLength: number) {
    const rule = this.liveRule.get();
    if (!rule) {
      this.reactiveState.dashLength = dashLength;
      this.reactiveState.gapLength = gapLength;
      return;
    }

    rule.style.setProperty('stroke-dasharray', `${dashLength} ${gapLength}`);
    this.reactiveState.internal.dashLength = dashLength;
    this.reactiveState.internal.gapLength = gapLength;
    this.commitDash();
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
          data-demo-target="editor:dash-length"
          ref={(input) => {
            if (!input) return;
            input.value = String(this.reactiveState.dashLength);
            input.addEventListener('input', this.paintDashLength);
            input.addEventListener('change', this.flushDash);
          }}
        />
        <label htmlFor="marker-gap-length">Gap Length</label>
        <input
          id="marker-gap-length"
          type="range"
          min="0.01"
          max="1.0"
          step="0.001"
          data-demo-target="editor:gap-length"
          ref={(input) => {
            if (!input) return;
            input.value = String(this.reactiveState.gapLength);
            input.addEventListener('input', this.paintGapLength);
            input.addEventListener('change', this.flushDash);
          }}
        />
        <label htmlFor="marker-line-cap">Line Cap</label>
        <select
          id="marker-line-cap"
          value={this.reactiveState.strokeLinecap}
          data-demo-target="editor:line-cap"
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

