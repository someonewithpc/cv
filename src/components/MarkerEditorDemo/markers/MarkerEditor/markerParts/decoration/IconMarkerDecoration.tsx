import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faIcons, faSpinner, faUpload } from "@fortawesome/free-solid-svg-icons";

import $store, { markerDecorationsSelector } from '../../../../store';

import { optimizeAndParseSVGToComponent } from "../../optimizeAndParseSVGToComponent";
import { MarkerPart, Point } from "../shared";
import type { PointLiteral } from "../shared";
import { onOptionKey } from "../../listboxKeys";

export class IconMarkerDecoration extends MarkerPart {
  get default() {
    return {
      center: new Point(0, -0.25),
      sizeCP: new Point(0.4, -0.25),
    };
  }

  buildControlPoints() {
    const marker = this;
    return {
      get center(): Point {
        return marker.state.center;
      },
      set center(value: PointLiteral | Point) {
        const xOffset = marker.state.sizeCP.x - marker.state.center.x;
        const yOffset = marker.state.sizeCP.y - marker.state.center.y;

        marker.constrainVertical(value, marker.state.center);
        marker.constrainSnap(marker.state.center);

        marker.state.sizeCP.x = xOffset + marker.state.center.x;
        marker.state.sizeCP.y = yOffset + marker.state.center.y;
      },

      get sizeCP(): Point {
        return marker.state.sizeCP;
      },
      set sizeCP(value: PointLiteral | Point) {
        marker.state.sizeCP.x = value.x;
        marker.state.sizeCP.y = value.y;
      },
    };
  }

  get center() { return this.controlPoints.center; }
  get sizeCP() { return this.controlPoints.sizeCP; }

  get radius() {
    return this.center.distanceTo(this.sizeCP);
  }

  Thumbnail() {
    return (
      <FontAwesomeIcon icon={faIcons} />
    );
  }

  get defaultReactiveState() {
    return {
      activeDecoration: null as null | string | number,
      decorations: [] as ReturnType<typeof markerDecorationsSelector>,
    };
  }

  get reactiveStateStoreHandler() {
    return {
      get decorations() {
        return markerDecorationsSelector($store.getState());
      },
    };
  }

  Loader(props: Record<string, any> = {}) {
    return (
      <FontAwesomeIcon
        icon={faSpinner}
        spin={true}
        {...props}
      />
    );
  }

  Content({ extraProps }: { extraProps: Record<string, string> }) {
    if (this.reactiveState.decorations.length === 0) return;
    if (this.reactiveState.activeDecoration === null) this.reactiveState.activeDecoration = this.reactiveState.decorations[0].id;

    const decoration = this.reactiveState.decorations.find((d) => d.id === this.reactiveState.activeDecoration)?.resolvedSource;

    if (!decoration) {
      const w = 0.75;
      return this.Loader({
        x: this.center.x - w / 2,
        y: this.center.y - w / 2,
        width: w,
        height: w,
        className: 'marker-decoration',
        'transform-origin': `${this.center.x} ${this.center.y}`,
      });
    } else {
      return optimizeAndParseSVGToComponent(
        decoration,
        {
          x: this.center.x - this.radius,
          y: this.center.y - this.radius,
          width: this.radius * 2,
          height: this.radius * 2,
          className: 'marker-decoration',
          style: { pointerEvents: 'none', zIndex: -1 },
          ...extraProps,
        },
      );
    }
  }

  Configuration() {
    if (this.reactiveState.decorations.length === 0) return;

    // One Tab stop for the list: the chosen icon, or the first while none is chosen.
    const chosen = this.reactiveState.decorations.some((d) => d.id === this.reactiveState.activeDecoration);

    return (
      <>
        <ul role="listbox" aria-label="Decorations">
          {this.reactiveState.decorations.map((d, index) => {
            const decoration = d.resolvedSource;
            const selected = d.id === this.reactiveState.activeDecoration;

            return (
              <li
                key={d.id}
                role="option"
                aria-label={`Decoration ${index + 1}`}
                aria-selected={selected}
                tabIndex={selected || (!chosen && index === 0) ? 0 : -1}
                onClick={() => {
                  this.reactiveState.activeDecoration = d.id;
                }}
                onKeyDown={onOptionKey}
              >
                {decoration ? optimizeAndParseSVGToComponent(decoration) : this.Loader()}
              </li>
            );
          })}
          <li
            role="option"
            aria-selected={false}
            aria-disabled="true"
            aria-label="Uploading is not available in this demo"
            className="decoration-uploader"
            title="Uploading is not available in this demo"
          >
            <FontAwesomeIcon icon={faUpload} />
          </li>
        </ul>
      </>
    );
  }

  title = 'Custom Icon';
}
