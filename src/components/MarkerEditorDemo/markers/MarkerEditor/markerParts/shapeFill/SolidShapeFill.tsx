import { SolidFill } from "../shared/SolidFill";

export class SolidShapeFill extends SolidFill {
  protected get fillClassName(): string {
    return 'marker-shape';
  }
}

