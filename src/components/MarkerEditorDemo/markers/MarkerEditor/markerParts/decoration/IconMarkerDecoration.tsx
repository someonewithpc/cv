import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faIcons, faSpinner, faUpload } from "@fortawesome/free-solid-svg-icons";
import { v4 as uuidv4 } from 'uuid';

import $store, { addDecoration, markerDecorationsSelector } from '@/store';
;

import { optimizeAndParseSVGToComponent } from "../../optimizeAndParseSVGToComponent";
import { MarkerPart, Point } from "../shared";
import type { PointLiteral } from "../shared";

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

    return (
      <>
        <ul role="listbox">
          {this.reactiveState.decorations.map((d) => {
            const decoration = d.resolvedSource;

            return (
              <li
                key={d.id}
                role="option"
                aria-selected={d.id === this.reactiveState.activeDecoration}
                onClick={() => {
                  this.reactiveState.activeDecoration = d.id;
                }}
              >
                {decoration ? optimizeAndParseSVGToComponent(decoration) : this.Loader()}
              </li>
            );
          })}
          <li
            role="option"
            aria-selected={false}
            className="decoration-uploader"
            title="Upload new SVG decoration"
          >
            <label htmlFor="marker-decoration-upload">
              <FontAwesomeIcon icon={faUpload} />
            </label>
            <input
              id="marker-decoration-upload"
              type="file"
              accept="image/svg+xml"
              onChange={(e) => {
                if (!e.target.files) return;
                const uploadedFiles = [...e.target.files];

                if (uploadedFiles.some((f) => f.type !== 'image/svg+xml')) {
                  return;
                }

                uploadedFiles.forEach((file) => {
                  const fileReader = new FileReader();
                  fileReader.onload = (e) => {
                    const { result } = e.target!;
                    if (typeof result !== 'string') return;
                    $store.dispatch(addDecoration({ id: uuidv4(), source: result, filename: file.name }));
                  };
                  fileReader.readAsDataURL(file);
                });
              }}
            />
          </li>
        </ul>
      </>
    );
  }

  title = 'Custom Icon';
}
