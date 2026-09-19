import { watchDrawingNote } from '@/client/drawingNote';
import { watchPageActive } from '@/client/frontPage';
import { variantsOf } from '@/components/SpaceBuilderDemo/MockScene/catalogItems';

import { createPlayer } from './autoplay';
import { enhanceCard } from './panel';
import { VARIANT_CARDS } from './variantsCatalog';

/**
 * The cards are already on the page; this only adds what needs a script. Thumbnails are
 * warmed at low priority so a hover preview does not flicker on a cold image.
 */
export function boot(host: HTMLElement) {
  host.querySelectorAll<HTMLElement>('[data-catalog-item]').forEach(enhanceCard);
  host.dataset.ready = 'true';

  const urls = new Set(VARIANT_CARDS.flatMap((card) => variantsOf(card).map((v) => v.thumb)));
  for (const url of urls) {
    const image = new Image();
    image.fetchPriority = 'low';
    image.src = url;
  }

  const player = createPlayer(host);
  const page = host.closest<HTMLElement>('article.technical-drawing-stack > * > section') ?? host;
  watchPageActive(page, (visible) => player.setActive(visible));
  watchDrawingNote(page, (open) => player.setNoteOpen(open));
}
