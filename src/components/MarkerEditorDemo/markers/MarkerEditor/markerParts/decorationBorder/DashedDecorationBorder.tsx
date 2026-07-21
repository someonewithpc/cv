import { DashedBorder } from "../shared/DashedBorder";

export class DashedDecorationBorder extends DashedBorder {
  protected get borderClassName(): string {
    return 'marker-decoration';
  }
}

