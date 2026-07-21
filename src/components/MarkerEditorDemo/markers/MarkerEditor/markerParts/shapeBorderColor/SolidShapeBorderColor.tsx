import { SolidBorderColor } from "../shared/SolidBorderColor";

export class SolidShapeBorderColor extends SolidBorderColor {
  protected get borderClassName(): string {
    return 'marker-shape';
  }
}
