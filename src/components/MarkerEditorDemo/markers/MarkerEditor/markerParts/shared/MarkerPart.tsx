import $store from '@/store';
import type { SpaceType } from '@/store';
import { clamp } from '../../../../lib/mapRange';
import { serializeKeyValue } from './serialization';

import { Point, type PointLiteral } from './Point';

export class MarkerPart {
  get default() { return {}; }
  get defaultReactiveState() { return {}; }
  get reactiveStateStoreHandler() { return {}; }
  state!: this['default'];
  reactiveState!: this['defaultReactiveState'] & { internal: Record<string, any>, subscribe: ((callback: Function) => (() => void)), getSnapshot: () => unknown };
  controlPoints!: Record<string, Point>;
  snappingControlPoints: Point[] = [];
  container: React.RefObject<SVGSVGElement | null>;

  constructor(container: React.RefObject<SVGSVGElement | null>) {
    this.container = container;

    this.reset();
  }

  reset() {
    this.state = this.default;
    this.controlPoints = this.buildControlPoints();

    const that = this;

    this.reactiveState = {
      internal: { ...this.defaultReactiveState },
      subscribe(callback: Function) {
        that.reactiveState.internal.callback = callback;

        const handler = () => {
          Object.keys(that.reactiveStateStoreHandler)
            .forEach((key) => {
              that.reactiveState[key as keyof typeof that['defaultReactiveState']] = (that.reactiveStateStoreHandler as Record<string, any>)[key];
            });
        };
        const unsubscribeStore = $store.subscribe(handler);
        handler();

        return () => {
          that.reactiveState.internal.callback = undefined;
          unsubscribeStore();
        };
      },
      getSnapshot() {
        const { callback, ...rest } = that.reactiveState.internal;
        return rest;
      },
    } as this['reactiveState'];

    Object.defineProperties(
      this.reactiveState,
      Object.fromEntries(
        Object.keys(this.defaultReactiveState).map((key) => [
          key,
          {
            get: () => this.reactiveState.internal[key],
            set: (val: any) => {
              this.reactiveState.internal[key] = val;
              this.reactiveState.internal.callback?.();
            },
            enumerable: true,
            configurable: false,
          },
        ])
      )
    );
  }

  setSnappingControlPoints(controlPoints: Point[]) {
    this.snappingControlPoints = controlPoints;
  }

  constrainSnap(point: Point) {
    const { minCP, minDist } = this.snappingControlPoints.reduce(
      ({ minCP, minDist }, cp) => {
        const distance = cp.distanceTo(point);
        return {
          minCP: distance <= minDist ? cp : minCP,
          minDist: distance <= minDist ? distance : minDist,
        };
      },
      { minCP: null as Point | null, minDist: Infinity },
    );

    if (minDist <= 0.05 && minCP) {
      point.x = minCP.x;
      point.y = minCP.y;
    }
  }

  // Constain `to` to be between `min` and `max` distance from `from`, in the direction of `value`
  constrainRadius(value: PointLiteral | Point, to: Point, from: Point, min: number, max: number) {
    const newRadius = from.distanceTo(value);
    to.x = (value.x - from.x) / newRadius * clamp(newRadius, min, max) + from.x;
    to.y = (value.y - from.y) / newRadius * clamp(newRadius, min, max) + from.y;
  }

  constrainVertical(value: PointLiteral | Point, to: Point, reference: PointLiteral | Point = { x: 0, y: NaN }) {
    to.x = reference.x;
    to.y = value.y;
  }

  constrainHorizontal(value: PointLiteral | Point, to: Point, reference: PointLiteral | Point = { x: NaN, y: 0 }) {
    to.x = value.x;
    to.y = reference.y;
  }

  constrainDistanceToLine(value: PointLiteral | Point, to: Point, normal: PointLiteral | Point, min: number, max: number) {
    const dot = value.x * normal.x + value.y * normal.y;
    const distance = clamp(dot, min, max);
    to.x = value.x + (distance - dot) * normal.x;
    to.y = value.y + (distance - dot) * normal.y;
  }

  mergeControlPointDescriptors<Base extends Record<string, any>, Self extends Record<string, any>>(base: Base, self: Self): Base & Self {
    const ret = {};
    const selfKeys = Object.keys(self);
    const parentDescriptor = Object.fromEntries(
      Object.entries(
        Object.getOwnPropertyDescriptors(base)
      ).filter(([name]) => !selfKeys.includes(name))
    );

    Object.defineProperties(ret, parentDescriptor);
    Object.defineProperties(ret, Object.getOwnPropertyDescriptors(self));

    return ret as Base & Self;
  }

  buildControlPoints() {
    return {};
  }

  get path(): string { throw new Error('Derived class must override `get path(): string`'); }

  get serializedState(): Record<string, string> {
    return {
      'data-kind': this.constructor.name,
      ...Object.fromEntries(
        Object.entries({
          state: this.state,
          'reactiveState': Object.fromEntries(
            Object.keys(this.defaultReactiveState)
              .filter(
                (name) => !Object.keys(this.reactiveStateStoreHandler).includes(name)
              ).map((key) => [
                key,
                (this.reactiveState as any)[key],
              ]),
          ),
        })
          .flatMap(
            ([property, state]) =>
              Object.entries(state)
                .filter(([, value]) => value !== undefined)
                .map(
                  ([name, value]) => {
                    return serializeKeyValue(property, name, value);
                  }
                ),
          ),
      ),
    };
  }

  Thumbnail({ space: _ }: { space: SpaceType }): React.ReactNode { throw new Error('Derived class must override `Thumbnail(space: SpaceType): ReactElement`'); }
  Content({ space: _, extraProps: __ }: { space: SpaceType, extraProps: Record<string, string> }): React.ReactNode { throw new Error('Derived class must override `Content(space: SpaceType): ReactElement`'); }
  Configuration({ space: _ }: { space: SpaceType }): React.ReactNode { return null; }

  SerializeContent({ space }: { space: SpaceType }): React.ReactNode {
    return this.Content({
      space,
      extraProps: this.serializedState,
    });
  }

  title = '';
}
