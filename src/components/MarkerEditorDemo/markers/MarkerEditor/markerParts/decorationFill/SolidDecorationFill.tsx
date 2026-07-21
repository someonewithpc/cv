import { SolidFill } from "../shared/SolidFill";

export class SolidDecorationFill extends SolidFill {
  protected get fillClassName(): string {
    return 'marker-decoration';
  }

  get defaultReactiveState() {
    return {
      color: '#89ab24', // $visrez-brand
    };
  }
}

