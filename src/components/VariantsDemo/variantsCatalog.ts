import { CATALOG_ITEMS, type CatalogItem } from '@/components/SpaceBuilderDemo/MockScene/catalogItems';

function card(id: string): CatalogItem {
  const item = CATALOG_ITEMS.find((entry) => entry.id === id);
  if (!item) throw new Error(`No catalog item ${id}`);
  return item;
}

/** The Chiavari, whose styles are finishes of one mesh: a carousel and no dropdowns. */
export const CHAIR_CARD = card('chair');

/** The banquet set, whose styles are seat counts and table sizes: two dropdowns. */
export const BANQUET_CARD = card('table-round');

export const VARIANT_CARDS = [CHAIR_CARD, BANQUET_CARD];
