import { NoneBorder } from "../shared/NoneBorder";

export class NoneDecorationBorder extends NoneBorder {
  protected get borderClassName(): string {
    return 'marker-decoration';
  }
}

