import { spaceBuilderAsset } from './assets';

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

const BANQUET_WIDE = '2.43m x 1.21m';
const BANQUET_NARROW = '1.82m x 76cm';
const CHAIR_SIZE = '42cm x 50cm x 95cm';

/** The Space Builder catalog — Chair, Side Chair and Banquet Table are real, loaded objects. */
export const CATALOG_ITEMS: CatalogItem[] = [
  {
    id: 'chair',
    name: 'Chair',
    thumb: spaceBuilderAsset('chair-thumb.webp'),
    real: true,
    layoutable: true,
    size: CHAIR_SIZE,
    // The library stocks the 2800 Chiavari in fifteen finishes, each its own object. The
    // demo ships one mesh and takes each finish's frame and pad colours from its object.
    variants: [
      {
        id: 'chair',
        style: 'Natural',
        thumb: spaceBuilderAsset('chair-thumb.webp'),
        pax: 1,
        size: CHAIR_SIZE,
      },
      {
        id: 'chair-gold',
        style: 'Gold',
        thumb: spaceBuilderAsset('chair-gold-thumb.webp'),
        tint: ['#caa470', '#f0f0f0'],
        pax: 1,
        size: CHAIR_SIZE,
      },
      {
        id: 'chair-silver',
        style: 'Silver',
        thumb: spaceBuilderAsset('chair-silver-thumb.webp'),
        tint: ['#969fa7', '#ffffff'],
        pax: 1,
        size: CHAIR_SIZE,
      },
      {
        id: 'chair-white',
        style: 'White',
        thumb: spaceBuilderAsset('chair-white-thumb.webp'),
        tint: ['#fdfdfd', '#fdfdfd'],
        pax: 1,
        size: CHAIR_SIZE,
      },
      {
        id: 'chair-black',
        style: 'Black',
        thumb: spaceBuilderAsset('chair-black-thumb.webp'),
        tint: ['#0d0d0d', '#0d0d0d'],
        pax: 1,
        size: CHAIR_SIZE,
      },
    ],
  },
  {
    id: 'armchair',
    name: 'Side Chair',
    thumb: spaceBuilderAsset('armchair-thumb.webp'),
    real: true,
    modelUrl: spaceBuilderAsset('armchair.glb'),
    size: '49cm x 53cm x 91cm',
  },
  { id: 'barstool', name: 'Barstool', thumb: spaceBuilderAsset('catalog/barstool.webp') },
  { id: 'lounge', name: 'Sofa', thumb: spaceBuilderAsset('catalog/lounge.webp') },
  {
    id: 'table-round',
    name: 'Banquet Table',
    thumb: spaceBuilderAsset('table-thumb.webp'),
    real: true,
    modelUrl: spaceBuilderAsset('banquet-8pax-243x121.glb'),
    size: BANQUET_WIDE,
    // The library stores each seat count and table size as its own object, so these are
    // four real models. 182x76 only goes up to six seats, which is why the picker greys
    // eight and four out once it is chosen.
    variants: [
      {
        id: 'table-8-243',
        style: 'Chiavari Chairs',
        thumb: spaceBuilderAsset('table-thumb.webp'),
        modelUrl: spaceBuilderAsset('banquet-8pax-243x121.glb'),
        pax: 8,
        size: BANQUET_WIDE,
      },
      {
        id: 'table-6-243',
        style: 'Chiavari Chairs',
        thumb: spaceBuilderAsset('table-6-thumb.webp'),
        modelUrl: spaceBuilderAsset('banquet-6pax-243x121.glb'),
        pax: 6,
        size: BANQUET_WIDE,
      },
      {
        id: 'table-4-243',
        style: 'Chiavari Chairs',
        thumb: spaceBuilderAsset('table-4-thumb.webp'),
        modelUrl: spaceBuilderAsset('banquet-4pax-243x121.glb'),
        pax: 4,
        size: BANQUET_WIDE,
      },
      {
        id: 'table-6-182',
        style: 'Chiavari Chairs',
        thumb: spaceBuilderAsset('table-6-narrow-thumb.webp'),
        modelUrl: spaceBuilderAsset('banquet-6pax-182x76.glb'),
        pax: 6,
        size: BANQUET_NARROW,
      },
    ],
  },
  { id: 'table-cocktail', name: 'Cocktail Table', thumb: spaceBuilderAsset('catalog/table-cocktail.webp') },
  { id: 'plant', name: 'Flower Pot', thumb: spaceBuilderAsset('catalog/plant.webp') },
  { id: 'umbrella', name: 'Outdoor Table With Umbrella', thumb: spaceBuilderAsset('catalog/umbrella.webp') },
  { id: 'round-table', name: 'Round Table', thumb: spaceBuilderAsset('catalog/table-round.webp') },
  { id: 'buffet', name: 'Buffet Table', thumb: spaceBuilderAsset('catalog/buffet.webp') },
  { id: 'bar', name: 'Bar', thumb: spaceBuilderAsset('catalog/bar.webp') },
];
