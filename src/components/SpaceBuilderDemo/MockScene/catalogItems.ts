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
};

/** The Space Builder catalog — only Chair is a real, loaded object. */
export const CATALOG_ITEMS: CatalogItem[] = [
  { id: 'chair', name: 'Chair', thumb: '/demos/space-builder/chair-thumb.webp', real: true, layoutable: true },
  { id: 'armchair', name: 'Armchair', thumb: '/demos/space-builder/catalog/armchair.svg' },
  { id: 'barstool', name: 'Bar Stool', thumb: '/demos/space-builder/catalog/barstool.svg' },
  { id: 'lounge', name: 'Lounge', thumb: '/demos/space-builder/catalog/lounge.svg' },
  { id: 'table-round', name: 'Round Table', thumb: '/demos/space-builder/catalog/table-round.svg' },
  { id: 'table-cocktail', name: 'Cocktail Table', thumb: '/demos/space-builder/catalog/table-cocktail.svg' },
  { id: 'plant', name: 'Planter', thumb: '/demos/space-builder/catalog/plant.svg' },
  { id: 'umbrella', name: 'Umbrella', thumb: '/demos/space-builder/catalog/umbrella.svg' },
];
