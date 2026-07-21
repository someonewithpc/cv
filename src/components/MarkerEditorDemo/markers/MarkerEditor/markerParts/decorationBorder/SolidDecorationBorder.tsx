import { SolidBorder } from "../shared/SolidBorder";

export class SolidDecorationBorder extends SolidBorder {
  protected get borderClassName(): string {
    return 'marker-decoration';
  }
}

