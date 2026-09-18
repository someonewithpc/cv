/**
 * One style of a catalog object. Space Builder's library keeps every finish, seat count
 * and size as its own object and groups them under one card; these mirror that group.
 */
export type CatalogVariant = {
  /** Unique across the catalog: the scene keys its loaded model by this. */
  id: string;
  /** Finish name, as the product labels a style. */
  style: string;
  thumb: string;
  /** GLB to load. Finishes of one model share a URL and differ only by `tint`. */
  modelUrl?: string;
  /**
   * Base colour per material slot, applied after load, so one GLB can serve several
   * finishes. `null` leaves that slot alone; slots follow the GLB's material order.
   */
  tint?: (string | null)[];
  /** Seats the object takes; 1 for a single chair, 8 for an eight-seat banquet set. */
  pax?: number;
  /**
   * Width x depth x height, printed the way Space Builder prints it
   * (utils/unitTranslation.js: x, z, then y; centimetres under a metre).
   */
  size?: string;
};

export type CatalogItem = {
  id: string;
  name: string;
  thumb: string;
  /** Real demo object — drag / dblclick places it. */
  real?: boolean;
  /** Only the Chair supports Build (draw an area, auto-arrange a layout). */
  layoutable?: boolean;
  /** GLB to load for a real, non-layoutable item (Chair loads its own via SpaceBuilderScene). */
  modelUrl?: string;
  size?: string;
  /** Every style the library carries under this card. The first one is the default. */
  variants?: CatalogVariant[];
};

/** The card's styles, with single-style objects read as a group of one. */
export function variantsOf(item: CatalogItem): CatalogVariant[] {
  return item.variants ?? [{
    id: item.id,
    style: item.name,
    thumb: item.thumb,
    modelUrl: item.modelUrl,
    size: item.size,
  }];
}

export function variantOf(item: CatalogItem, variantId: string | undefined): CatalogVariant {
  const variants = variantsOf(item);
  return variants.find((variant) => variant.id === variantId) ?? variants[0];
}

/** The Space Builder catalog — Chair, Side Chair and Banquet Table are real, loaded objects. */
export const CATALOG_ITEMS: CatalogItem[] = [
  {
    id: 'chair',
    name: 'Chair',
    thumb: '/demos/space-builder/chair-thumb.webp',
    real: true,
    layoutable: true,
    size: '42cm x 50cm x 95cm',
  },
  {
    id: 'armchair',
    name: 'Side Chair',
    thumb: '/demos/space-builder/armchair-thumb.webp',
    real: true,
    modelUrl: '/demos/space-builder/armchair.glb',
    size: '49cm x 53cm x 91cm',
  },
  { id: 'barstool', name: 'Bar Stool', thumb: '/demos/space-builder/catalog/barstool.svg' },
  { id: 'lounge', name: 'Lounge', thumb: '/demos/space-builder/catalog/lounge.svg' },
  {
    id: 'table-round',
    name: 'Banquet Table',
    thumb: '/demos/space-builder/table-thumb.webp',
    real: true,
    modelUrl: '/demos/space-builder/banquet-table.glb',
    size: '2.6m x 2.1m x 95cm',
  },
  { id: 'table-cocktail', name: 'Cocktail Table', thumb: '/demos/space-builder/catalog/table-cocktail.svg' },
  { id: 'plant', name: 'Planter', thumb: '/demos/space-builder/catalog/plant.svg' },
  { id: 'umbrella', name: 'Umbrella', thumb: '/demos/space-builder/catalog/umbrella.svg' },
];
