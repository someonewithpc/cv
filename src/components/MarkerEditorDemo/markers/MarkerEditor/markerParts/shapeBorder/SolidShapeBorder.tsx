import { SolidBorder } from "../shared/SolidBorder";

export class SolidShapeBorder extends SolidBorder {
  protected get borderClassName(): string {
    return 'marker-shape';
  }
}
