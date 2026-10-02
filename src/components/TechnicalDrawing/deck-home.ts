/* Where a sheet's transport deck sits. On a landscape sheet it fills the bottom band, which
   holds the whole deck at every landscape width. A portrait sheet's band is 0.625rem deep,
   shallower than a key, and the dog-eared corner covers its start, so there the deck moves
   under the page into the callout's card (Callout.astro), the slip filed under the stack, as
   its first entry, over the title.

   The fit is CSS's: the frame's probe query picks the orientation, which Stack.astro restates
   as data-sheet-orientation. Script only does the move, because the card is outside the sheet
   and the sheet clips and contains what it holds. Only the front page's deck goes to the card,
   so a stack whose pages each show a deck still gives the slip one. */

import { FULL_MOTION_ATTRIBUTE } from '@/client/autoplayStatus';
import { isFrontPage, watchFrontPage } from '@/client/frontPage';

export function homeDeck(stack: HTMLElement, page: HTMLElement) {
  const deck = page.querySelector<HTMLElement>(':scope > [data-demo-transport]');
  const card = stack.closest('.callout')?.querySelector<HTMLElement>('.callout-card');
  if (!deck || !card) return;

  const place = () => {
    const home = stack.dataset.sheetOrientation === 'portrait' && isFrontPage(page) ? card : page;
    if (deck.parentElement === home) return;
    if (home === card) card.prepend(deck);
    else home.append(deck);
  };
  new MutationObserver(place).observe(stack, { attributes: true, attributeFilter: ['data-sheet-orientation'] });
  watchFrontPage(page, place);
  place();

  // Play under reduced motion runs the walkthrough at full motion, which the sheet says with an
  // attribute the lamp reads from its ancestors. Off the sheet, the deck carries it itself.
  const motion = () => deck.toggleAttribute(FULL_MOTION_ATTRIBUTE, page.hasAttribute(FULL_MOTION_ATTRIBUTE));
  new MutationObserver(motion).observe(page, { attributes: true, attributeFilter: [FULL_MOTION_ATTRIBUTE] });
}
