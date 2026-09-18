import { BANQUET_CARD, CHAIR_CARD } from './variantsCatalog';

export type AutoplayStep = {
  /** CSS selector, resolved inside the demo root each time the step runs. */
  aim: string;
  /** Wait before the step's own action, in ms. */
  delay: number;
  act?: 'click' | 'hover';
  /** Caption for the toast strip, if this step deserves one. */
  say?: string;
};

const CHAIR = `[data-catalog-item="${CHAIR_CARD.id}"]`;
const SET = `[data-catalog-item="${BANQUET_CARD.id}"]`;

/**
 * One loop of the demo: recolour the chair, then take the banquet set through its seat
 * count and its table size, ending on a pair the library does not carry. Every step is a
 * control a visitor can work itself.
 */
export const AUTOPLAY_STEPS: AutoplayStep[] = [
  { aim: `${CHAIR} .object-icons`, delay: 1400 },
  { aim: `${CHAIR} button.next`, delay: 700, act: 'click', say: 'Chair · next finish' },
  { aim: `${CHAIR} button.next`, delay: 2200, act: 'click' },
  { aim: `${CHAIR} button.next`, delay: 2200, act: 'click' },

  { aim: `${SET} .object-pax .hover-select-current`, delay: 2000, act: 'click', say: 'Banquet Table · seats' },
  { aim: `${SET} .object-pax li:nth-child(2) button`, delay: 900, act: 'hover' },
  { aim: `${SET} .object-pax li:nth-child(2) button`, delay: 900, act: 'click' },

  { aim: `${SET} .object-size .hover-select-current`, delay: 2200, act: 'click', say: 'Banquet Table · table size' },
  { aim: `${SET} .object-size li:nth-child(2) button`, delay: 900, act: 'hover' },
  { aim: `${SET} .object-size li:nth-child(2) button`, delay: 900, act: 'click' },

  { aim: `${SET} .object-pax .hover-select-current`, delay: 2200, act: 'click' },
  { aim: `${SET} .object-pax li:nth-child(1) button`, delay: 900, act: 'hover' },
  {
    aim: `${SET} .object-pax li:nth-child(1) button`,
    delay: 900,
    act: 'click',
    say: 'No eight-seat small table · the size moves back',
  },
  { aim: `${SET} .object-icons`, delay: 2600 },
];

export function findTarget(root: ParentNode, selector: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(selector);
}

export function runStep(el: HTMLElement, act: AutoplayStep['act']) {
  if (act === 'click') el.click();
  if (act === 'hover') el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
}
