import { demoGate } from '@/client/frontPage';
import { variantsOf } from '@/components/SpaceBuilderDemo/MockScene/catalogItems';

import { createPlayer } from './autoplay';
import { enhancePanel } from './panel';
import { VARIANT_CARDS } from './variantsCatalog';

/**
 * The cards are already on the page; this only adds what needs a script. Thumbnails are
 * warmed at low priority so a hover preview does not flicker on a cold image.
 */
export function boot(host: HTMLElement) {
  enhancePanel(host);
  host.dataset.ready = 'true';

  const urls = new Set(VARIANT_CARDS.flatMap((card) => variantsOf(card).map((v) => v.thumb)));
  for (const url of urls) {
    const image = new Image();
    image.fetchPriority = 'low';
    image.src = url;
  }

  const page = host.closest<HTMLElement>('article.technical-drawing-stack > * > section') ?? host;
  const gate = demoGate(page);
  const player = createPlayer(host, gate);
  gate.onChange((visible) => player.setActive(visible));
}
