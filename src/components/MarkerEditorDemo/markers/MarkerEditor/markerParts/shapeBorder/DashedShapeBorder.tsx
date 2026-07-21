import { DashedBorder } from "../shared/DashedBorder";

export class DashedShapeBorder extends DashedBorder {
  protected get borderClassName(): string {
    return 'marker-shape';
  }
}
