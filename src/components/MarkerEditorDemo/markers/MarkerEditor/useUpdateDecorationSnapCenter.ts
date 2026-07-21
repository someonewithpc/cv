import { useEffect, type Dispatch, type SetStateAction } from "react";

import { MarkerPart, markers, Point } from "./markerParts";
import type { StateType } from "./markerParts";

export function useUpdateDecorationSnapCenter(state: StateType, setState: Dispatch<SetStateAction<StateType>>, updateAll: () => void) {
  useEffect(() => {
    const decoration = markers.decoration[state.active.decoration] as MarkerPart & { center: Point; default: { center: Point } };
    const shape = markers.shape[state.active.shape] as MarkerPart & { center?: Point };

    if (!decoration || !decoration.center) return;

    const shapeCenter = shape.center ?? new Point(0, 0);
    const referenceCenter = state.previousDecorationSnapCenter ?? decoration.default.center;

    const tolerance = 0.01;
    if (Math.hypot(decoration.center.x - referenceCenter.x,
      decoration.center.y - referenceCenter.y) < tolerance
      && Math.hypot(decoration.controlPoints.center.x - shapeCenter.x,
        decoration.controlPoints.center.y - shapeCenter.y) > tolerance) {
      decoration.controlPoints.center = shapeCenter;
      setState((prev) => ({ ...prev, previousDecorationSnapCenter: shapeCenter }));
      updateAll();
    }
  }, [state.active.shape, state.active.decoration, state.previousDecorationSnapCenter, updateAll, setState]);
}
