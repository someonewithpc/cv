import { NoneBorder } from "../shared/NoneBorder";

export class NoneShapeBorder extends NoneBorder {
  protected get borderClassName(): string {
    return 'marker-shape';
  }
}
