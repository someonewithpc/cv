import { SolidBorderColor } from "../shared/SolidBorderColor";

export class SolidDecorationBorderColor extends SolidBorderColor {
  protected get borderClassName(): string {
    return 'marker-decoration';
  }
}

