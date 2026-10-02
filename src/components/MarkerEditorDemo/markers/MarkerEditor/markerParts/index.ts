import { createRef, useEffect, useMemo } from "react";
import { useSyncExternalStore } from "react";
import _partition from 'lodash/partition';

import { imperativeReactComponent } from '../../../lib/imperativeReactComponent';
import store, { markerEditingSpaceSelector } from '@/store';
import type { SpaceType } from '@/store';

import { EmptyMarkerDecoration } from "./decoration/EmptyMarkerDecoration";
import { IconMarkerDecoration } from "./decoration/IconMarkerDecoration";
import { LowercaseSpaceLetterMarkerDecoration } from "./decoration/LowercaseSpaceLetterMarkerDecoration";
import { SpaceNumberMarkerDecoration } from "./decoration/SpaceNumberMarkerDecoration";
import { UppercaseSpaceLetterMarkerDecoration } from "./decoration/UppercaseSpaceLetterMarkerDecoration";
import { CircleMarkerShape } from "./shape/CircleMarkerShape";
import { TeardropMarkerShape } from "./shape/TeardropMarkerShape";
import { PinMarkerShape } from "./shape/PinMarkerShape";
import { SquircleMarkerShape } from "./shape/SquircleMarkerShape";
import { FreeTextMarkerDecoration } from "./decoration/FreeTextMarkerDecoration";
import { NoneShapeBorder } from "./shapeBorder/NoneShapeBorder";
import { SolidShapeBorder } from "./shapeBorder/SolidShapeBorder";
import { DashedShapeBorder } from "./shapeBorder/DashedShapeBorder";
import { SolidShapeBorderColor } from "./shapeBorderColor/SolidShapeBorderColor";
import { NoneDecorationBorder } from "./decorationBorder/NoneDecorationBorder";
import { SolidDecorationBorder } from "./decorationBorder/SolidDecorationBorder";
import { DashedDecorationBorder } from "./decorationBorder/DashedDecorationBorder";
import { SolidDecorationBorderColor } from "./decorationBorderColor/SolidDecorationBorderColor";
import { SolidShapeFill } from "./shapeFill/SolidShapeFill";
import { SolidDecorationFill } from "./decorationFill/SolidDecorationFill";
import { DecorationFont } from "./decorationFont/DecorationFont";

import { MarkerPart, Point } from "./shared";

export * from './shared';

const classes = {
  EmptyMarkerDecoration,
  IconMarkerDecoration,
  LowercaseSpaceLetterMarkerDecoration,
  SpaceNumberMarkerDecoration,
  UppercaseSpaceLetterMarkerDecoration,
  CircleMarkerShape,
  TeardropMarkerShape,
  PinMarkerShape,
  SquircleMarkerShape,
  FreeTextMarkerDecoration,
  NoneShapeBorder,
  SolidShapeBorder,
  DashedShapeBorder,
  SolidShapeBorderColor,
  NoneDecorationBorder,
  SolidDecorationBorder,
  DashedDecorationBorder,
  SolidDecorationBorderColor,
  SolidShapeFill,
  SolidDecorationFill,
  DecorationFont,
};

MarkerPart.registerKinds(classes);

export const svgRef = createRef<SVGSVGElement>();

export const markers = {
  shape: {
    teardrop: new TeardropMarkerShape(svgRef),
    circle: new CircleMarkerShape(svgRef),
    pin: new PinMarkerShape(svgRef),
    squircle: new SquircleMarkerShape(svgRef),
  },

  shapeBorder: {
    none: new NoneShapeBorder(svgRef),
    solid: new SolidShapeBorder(svgRef),
    dashed: new DashedShapeBorder(svgRef),
  },

  shapeBorderColor: {
    solid: new SolidShapeBorderColor(svgRef),
  },

  shapeFill: {
    solid: new SolidShapeFill(svgRef),
  },

  decoration: {
    empty: new EmptyMarkerDecoration(svgRef),
    freeText: new FreeTextMarkerDecoration(svgRef),
    spaceNumber: new SpaceNumberMarkerDecoration(svgRef),
    upperSpaceLetter: new UppercaseSpaceLetterMarkerDecoration(svgRef),
    lowerSpaceLetter: new LowercaseSpaceLetterMarkerDecoration(svgRef),
    customIcon: new IconMarkerDecoration(svgRef),
  },

  decorationBorder: {
    none: new NoneDecorationBorder(svgRef),
    solid: new SolidDecorationBorder(svgRef),
    dashed: new DashedDecorationBorder(svgRef),
  },

  decorationBorderColor: {
    solid: new SolidDecorationBorderColor(svgRef),
  },

  decorationFill: {
    solid: new SolidDecorationFill(svgRef),
  },

  decorationFont: {
    font: new DecorationFont(svgRef),
  },
};

export type Markers = typeof markers;
export type StepsType = keyof Markers;
export type ControlPointNamesTypeFor<T> = T[keyof T] extends infer M
                                 ? M extends { controlPoints: infer CP }
                                 ? keyof CP
                                 : never
                                 : never;

export type StateType = {
  active: {
    shape: keyof Markers['shape'],
    decoration: keyof Markers['decoration'],
    shapeBorder: keyof Markers['shapeBorder'],
    shapeBorderColor: keyof Markers['shapeBorderColor'],
    decorationBorder: keyof Markers['decorationBorder'],
    decorationBorderColor: keyof Markers['decorationBorderColor'],
    shapeFill: keyof Markers['shapeFill'],
    decorationFill: keyof Markers['decorationFill'],
    decorationFont: keyof Markers['decorationFont'],
  },
  step: StepsType,
  draggedControlPoint: { [S in StepsType]: ControlPointNamesTypeFor<Markers[S]> }[StepsType] | undefined,
  snappingDisabled: boolean,
  previousDecorationSnapCenter: Point | null,
};

// For each active step and active option, a list of steps that should be disabled, because they're not compatible
export const disabledStepCombinations: Partial<Record<StepsType, Record<keyof Markers[StepsType], StepsType[]>>> = {
  shapeBorder: {
    none: ['shapeBorderColor'],
  },
  decoration: {
    empty: ['decorationBorder', 'decorationBorderColor', 'decorationFill', 'decorationFont'],
    customIcon: ['decorationBorder', 'decorationBorderColor', 'decorationFill', 'decorationFont'],
  },
  decorationBorder: {
    none: ['decorationBorderColor'],
  },
} as const;

export const markerStepContent = Object.fromEntries(
  Object.keys(markers).map(
    (step) => [
      step,
      imperativeReactComponent(
        ['http://www.w3.org/2000/svg', 'g'],
        step,
        {
          id: `marker-content-${step}`,
          style: { pointerEvents: 'none' },
        },
      ),
    ],
  ),
);

function makePartReactiveStateSnapshot() {
  return Object
    .values(markers)
    .flatMap((step) => Object
      .values(step)
      .map((part) => {
        const { callback, ...rest } = part.reactiveState.internal;
        return rest;
      }),
    );
}

let cachedReactiveStateSnapshot = makePartReactiveStateSnapshot();
const getReactiveStateSnapshot = () => cachedReactiveStateSnapshot;

const subscribeReactiveState = (callback: Function) => {
  const unsubscribes = Object
    .values(markers)
    .flatMap((step) => Object
      .values(step)
      .map((part) => part.reactiveState.subscribe(() => {
        cachedReactiveStateSnapshot = makePartReactiveStateSnapshot();
        callback();
      })),
    );

  return () => {
    unsubscribes.forEach((cb) => cb());
  };
};

export function useMarkerReactiveState() {
  return useSyncExternalStore(subscribeReactiveState, getReactiveStateSnapshot);
}

export function useControlPointIndicatorRefs() {
  return useMemo(
    () => Object.fromEntries(
      Object.entries(markers)
        .map(([step, options]) => [
          step,
          Object.fromEntries(
            Object.entries(options)
              .map(([name, marker]) => [
                name,
                Object.fromEntries(
                  Object.keys(marker.controlPoints)
                    .map((controlPointName) => [
                      controlPointName,
                      { user: createRef<SVGGElement>(), constrained: createRef<SVGGElement>() },
                    ]),
                ),
              ]),
          ),
        ]),
    ),
    [],
  );
}

export function useSyncSnappingControlPointsState(state: StateType) {
  useEffect(() => {
    Object.entries(state.active)
      .forEach(([step, part]) => {
        // otherPart !== part also drops other steps whose active option shares a name
        // with this one's (several steps default to 'solid'). That looks like a stray
        // condition, but the product's marker editor filters the same way, so this stays.
        const controlPoints = state.snappingDisabled
          ? []
          : Object.entries(state.active)
              .filter(([otherStep, otherPart]) => otherStep !== step && otherPart !== part)
              .flatMap(([otherStep, otherPart]) => Object.values((markers[otherStep as keyof typeof markers] as any)[otherPart].controlPoints));

        (markers[step as keyof typeof markers] as any)[part].setSnappingControlPoints(controlPoints);
      });
  }, [state.active, state.snappingDisabled]);
}

export const markerConfigurationComponents: Record<string, Record<string, React.ComponentType<{ space: SpaceType }>>> = Object.fromEntries(
  Object.entries(markers).map(
    ([step, options]) => [
      step,
      Object.fromEntries(
        Object.entries(options).map(([name, marker]) => [
          name,
          marker.Configuration.bind(marker) as React.ComponentType<{ space: SpaceType }>,
        ]),
      ),
    ],
  ),
);

export const markerThumbnailComponents: Record<string, Record<string, React.ComponentType<{ space: SpaceType }>>> = Object.fromEntries(
  Object.entries(markers).map(
    ([step, options]) => [
      step,
      Object.fromEntries(
        Object.entries(options).map(([name, marker]) => [
          name,
          marker.Thumbnail.bind(marker) as React.ComponentType<{ space: SpaceType }>,
        ]),
      ),
    ],
  ),
);

// @ts-ignore
if (typeof module !== 'undefined' && (module as any).hot) {
  // @ts-ignore
  (module as any).hot.accept(
    [
      "./decoration/EmptyMarkerDecoration",
      "./decoration/IconMarkerDecoration",
      "./decoration/LowercaseSpaceLetterMarkerDecoration",
      "./decoration/SpaceNumberMarkerDecoration",
      "./decoration/UppercaseSpaceLetterMarkerDecoration",
      "./decoration/FreeTextMarkerDecoration",
      "./shape/CircleMarkerShape",
      "./shape/TeardropMarkerShape",
      "./shape/PinMarkerShape",
      "./shape/SquircleMarkerShape",
      "./shapeBorder/NoneShapeBorder",
      "./shapeBorder/SolidShapeBorder",
      "./shapeBorder/DashedShapeBorder",
      "./shapeBorderColor/SolidShapeBorderColor",
      "./decorationBorder/NoneDecorationBorder",
      "./decorationBorder/SolidDecorationBorder",
      "./decorationBorder/DashedDecorationBorder",
      "./decorationBorderColor/SolidDecorationBorderColor",
      "./shapeFill/SolidShapeFill",
      "./decorationFill/SolidDecorationFill",
      "./decorationFont/DecorationFont",
    ],
    (paths: string[]) => {
      paths.forEach((path) => {
        const [, step, partName] = path.match(/.*\/markerParts\/([^/]+)\/([^/]+).tsx?/) as [any, keyof typeof markers, string];
        const [name, previousPart] = Object.entries(markers[step]).find(([, part]) => part.kind === partName) as [string, MarkerPart];

        const newPart = new classes[partName as keyof typeof classes](svgRef);

        Object.keys(newPart.state)
          .forEach(
            (name: string) => {
              (newPart.state as Record<string, Point>)[name].x = (previousPart.state as Record<string, Point>)[name].x;
              (newPart.state as Record<string, Point>)[name].y = (previousPart.state as Record<string, Point>)[name].y;
            },
          );

        newPart.setSnappingControlPoints(previousPart.snappingControlPoints);

        markerConfigurationComponents[step][name] = newPart.Configuration.bind(newPart) as React.ComponentType<{ space: SpaceType }>;
        markerThumbnailComponents[step][name] = newPart.Thumbnail.bind(newPart) as React.ComponentType<{ space: SpaceType }>;

        newPart.reactiveState.internal.callback = previousPart.reactiveState.internal.callback;

        const space = markerEditingSpaceSelector(store.getState());
        if (space) {
          markerStepContent[step].update(newPart.Content({ space, extraProps: {} }));
        }

        cachedReactiveStateSnapshot = makePartReactiveStateSnapshot();
        newPart.reactiveState.internal.callback?.();

        (markers[step] as any)[name] = newPart;
      });
    },
  );

  // @ts-ignore And for this module too
  module.hot.decline();
}
