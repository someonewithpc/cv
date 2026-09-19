import { variantsOf, type CatalogVariant } from '@/components/SpaceBuilderDemo/MockScene/catalogItems';

import { formatSize, unitsFor } from './units';
import { VARIANT_CARDS } from './variantsCatalog';

// Server output is metric; a US-region visitor gets the same sizes in feet and inches.
const UNITS = unitsFor(navigator.language);

/**
 * The catalog's one selected object, as CatalogField.vue keeps a single selectedObject
 * for every card it lists. A card is active while the object it shows is that one, so
 * hovering another option on the selected card takes the highlight off until the pointer
 * leaves or a click commits, the way CatalogObjectField.vue's `.active` binding does.
 */
type Selection = {
  /** The selected variant, when it belongs to this card; undefined on the other cards. */
  onCard(card: HTMLElement): CatalogVariant | undefined;
  select(card: HTMLElement, variant: CatalogVariant): void;
  /** Re-read each card's visible variant against the selection. */
  refresh(): void;
};

/**
 * What the script adds to the server-rendered panel: one selection across its cards,
 * a hover preview on each dropdown option, picks that commit, and carousel arrows and
 * pips where the browser lacks CSS scroll markers. The cards are Card.astro's HTML,
 * left in place.
 */
export function enhancePanel(host: HTMLElement) {
  const cards = [...host.querySelectorAll<HTMLElement>('[data-catalog-item]')];
  const initial = cards.find((card) => card.classList.contains('active')) ?? cards[0];
  if (!initial) return;
  const initialVariant = initial.dataset.variant;

  let selected = { card: initial, variant: initialVariant };
  const applySelection = () => cards.forEach((card) => {
    card.classList.toggle('active', card === selected.card && card.dataset.variant === selected.variant);
  });

  const selection: Selection = {
    onCard(card) {
      if (card !== selected.card) return undefined;
      const item = VARIANT_CARDS.find((entry) => entry.id === card.dataset.catalogItem);
      return item ? variantsOf(item).find((v) => v.id === selected.variant) : undefined;
    },
    select(card, variant) {
      selected = { card, variant: variant.id };
      applySelection();
    },
    refresh: applySelection,
  };

  const resets = cards.map((card) => enhanceCard(card, selection));

  // The autoplay loop starts each round from the library's default.
  host.addEventListener('variants:reset', () => {
    selected = { card: initial, variant: initialVariant };
    resets.forEach((reset) => reset?.());
    applySelection();
  });
  applySelection();
}

function enhanceCard(card: HTMLElement, selection: Selection) {
  const item = VARIANT_CARDS.find((entry) => entry.id === card.dataset.catalogItem);
  if (!item) return undefined;
  const variants = variantsOf(item);
  const variantById = (id: string | undefined) => variants.find((v) => v.id === id) ?? variants[0];

  // What the card holds, as against what it shows: a hover preview only shows, and the
  // held object comes back when the pointer leaves, as HoverSelect.vue's leave puts the
  // initial option back.
  let committed = variantById(card.dataset.variant);
  const held = () => committed;
  const show = (variant: CatalogVariant) => {
    render(card, variants, variant, selection.onCard(card));
    selection.refresh();
  };
  const hold = (variant: CatalogVariant) => {
    committed = variant;
    show(variant);
  };
  const pick = (variant: CatalogVariant) => {
    selection.select(card, variant);
    hold(variant);
  };
  show(committed);

  // Clicking the picture picks what it shows, as CatalogObjectThumbnail.vue's LoadImg
  // click does. A click that lands on the list itself is on a scroll button or marker,
  // pseudo-elements that report the list as their target, and those only scroll.
  const icons = card.querySelector<HTMLElement>('.object-icons');
  icons?.addEventListener('click', (event) => {
    if (icons.classList.contains('styles') && event.target === icons) return;
    pick(variantById(card.dataset.variant));
  });

  const styles = card.querySelector<HTMLElement>('ul.styles');
  if (styles) enhanceCarousel(card, styles, (variant) => {
    // Stepping the selected card's carousel moves the selection with it; on another
    // card it only changes what is shown, as CatalogObjectThumbnailOverlay.vue emits
    // its click only when the style it left was the selected one.
    if (selection.onCard(card)) pick(variant);
    else hold(variant);
  });

  card.querySelectorAll<HTMLDetailsElement>('details.hover-select').forEach((row) => {
    enhanceRow(row, variants, held, show, pick);
  });

  return () => {
    card.querySelectorAll<HTMLDetailsElement>('details[open]').forEach((row) => {
      row.open = false;
    });
    hold(variants[0]);
  };
}

/** Keep as much of the current pick as the library allows, the way the product does. */
function byPax(variants: CatalogVariant[], current: CatalogVariant, pax: number) {
  return variants.find((v) => (v.pax ?? 0) === pax && v.size === current.size)
    ?? variants.find((v) => (v.pax ?? 0) === pax);
}

function bySize(variants: CatalogVariant[], current: CatalogVariant, size: string) {
  return variants.find((v) => v.size === size && v.pax === current.pax)
    ?? variants.find((v) => v.size === size);
}

function enhanceRow(
  row: HTMLDetailsElement,
  variants: CatalogVariant[],
  held: () => CatalogVariant,
  show: (variant: CatalogVariant) => void,
  pick: (variant: CatalogVariant) => void,
) {
  const isPax = row.classList.contains('object-pax');
  const resolve = (value: string) => (isPax
    ? byPax(variants, held(), Number(value))
    : bySize(variants, held(), value));

  row.querySelectorAll<HTMLElement>('.hover-select-options li').forEach((option) => {
    const button = option.querySelector('button');
    const value = option.dataset.value ?? '';
    const preview = () => {
      const variant = resolve(value);
      if (variant) show(variant);
    };
    button?.addEventListener('mouseover', preview);
    button?.addEventListener('focus', preview);
    button?.addEventListener('click', (event) => {
      event.stopPropagation();
      row.open = false;
      const variant = resolve(value);
      if (variant) pick(variant);
    });
  });

  // Space Builder puts the preview back when the pointer leaves without a pick.
  row.addEventListener('mouseleave', () => {
    row.open = false;
  });
  row.addEventListener('toggle', () => {
    if (!row.open) show(held());
  });
  row.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') row.open = false;
  });
}

/**
 * Draw one variant on the card: thumbnail, row labels and which options it rules out.
 * The greyed options are judged against the selected object, as CatalogObjectFooter.vue's
 * isAvailablePax does, so a card that holds no selection greys nothing.
 */
export function render(
  card: HTMLElement,
  variants: CatalogVariant[],
  visible: CatalogVariant,
  selected: CatalogVariant | undefined,
) {
  card.dataset.variant = visible.id;
  const img = card.querySelector<HTMLImageElement>('.object-icons > img');
  if (img && img.getAttribute('src') !== visible.thumb) img.src = visible.thumb;

  const pax = card.querySelector<HTMLElement>('.object-pax');
  if (pax) {
    setText(pax, `${visible.pax ?? 0} seats`, `Seats, ${visible.pax ?? 0}`);
    pax.querySelectorAll<HTMLElement>('.hover-select-options li').forEach((option) => {
      const value = Number(option.dataset.value);
      const available = !selected
        || variants.some((v) => (v.pax ?? 0) === value && v.size === selected.size);
      option.classList.toggle('unavailable', !available);
    });
  }

  const size = card.querySelector<HTMLElement>('.object-size');
  if (size && visible.size) {
    const text = formatSize(visible.size, UNITS);
    setText(size, text, `Size, ${text}`);
    size.querySelectorAll<HTMLElement>('.hover-select-options li').forEach((option) => {
      const value = option.dataset.value ?? '';
      const label = option.querySelector<HTMLElement>('.option-text');
      if (label && label.textContent !== formatSize(value, UNITS)) label.textContent = formatSize(value, UNITS);
      const available = !selected
        || variants.some((v) => v.size === value && v.pax === selected.pax);
      option.classList.toggle('unavailable', !available);
    });
  }
}

function setText(row: HTMLElement, text: string, label: string) {
  const current = row.querySelector<HTMLElement>('.hover-select-current');
  const target = current ?? row;
  const span = target.querySelector<HTMLElement>(':scope > .option-text');
  if (span && span.textContent !== text) span.textContent = text;
  current?.setAttribute('aria-label', label);
}

const hasScrollMarkers = () => CSS.supports('selector(::scroll-marker)');
const hasScrollTimeline = () => CSS.supports('animation-timeline: scroll()');

/** Scroll the carousel so that slide `index` is the snapped one. */
export function scrollToStyle(styles: HTMLElement, index: number) {
  const slides = styles.querySelectorAll<HTMLElement>('.style');
  const slide = slides[Math.max(0, Math.min(slides.length - 1, index))];
  if (!slide) return;
  styles.scrollTo({ left: slide.offsetLeft, behavior: 'smooth' });
}

function enhanceCarousel(card: HTMLElement, styles: HTMLElement, commit: (variant: CatalogVariant) => void) {
  const slides = [...styles.querySelectorAll<HTMLElement>('.style')];
  const dot = card.querySelector<HTMLElement>('.active-pip');
  const thumbnail = styles.parentElement!;
  let current = Number(styles.dataset.index ?? 0);

  const controls = hasScrollMarkers() ? null : buildControls(thumbnail, styles, slides);

  const setCurrent = (index: number) => {
    if (index === current) return;
    current = index;
    styles.dataset.index = String(index);
    if (!hasScrollTimeline()) dot?.style.setProperty('--index', String(index));
    controls?.update(index);
  };

  // Which slide is snapped: scrollend is the commit; the observer keeps the pips and the
  // dot honest mid-scroll, which the CSS version gets from the timeline and :target-current.
  if (controls || !hasScrollTimeline()) {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.intersectionRatio >= 0.6) setCurrent(slides.indexOf(entry.target as HTMLElement));
      }
    }, { root: styles, threshold: 0.6 });
    slides.forEach((slide) => observer.observe(slide));
  }

  styles.addEventListener('scrollend', () => {
    const index = Math.round(styles.scrollLeft / Math.max(1, styles.clientWidth));
    setCurrent(index);
    const id = slides[index]?.dataset.variant;
    const variant = VARIANT_CARDS.flatMap(variantsOf).find((v) => v.id === id);
    if (variant) commit(variant);
  });
}

function buildControls(thumbnail: HTMLElement, styles: HTMLElement, slides: HTMLElement[]) {
  const previous = arrowButton('previous', 'Previous style', 'M31 239 175 95c9-9 24-9 33 0s9 24 0 33L97 256l111 128c9 9 9 24 0 33s-24 9-33 0L31 273a24 24 0 0 1 0-34z');
  const next = arrowButton('next', 'Next style', 'M225 273 81 417c-9 9-24 9-33 0s-9-24 0-33l111-128L48 128c-9-9-9-24 0-33s24-9 33 0l144 144a24 24 0 0 1 0 34z');
  const pips = document.createElement('ul');
  pips.className = 'pagination-control';
  const buttons = slides.map((slide, index) => {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', slide.getAttribute('aria-label') ?? `Style ${index + 1}`);
    button.addEventListener('click', () => scrollToStyle(styles, index));
    li.append(button);
    pips.append(li);
    return button;
  });

  const update = (index: number) => {
    previous.disabled = index <= 0;
    next.disabled = index >= slides.length - 1;
    buttons.forEach((button, i) => {
      if (i === index) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });
  };
  previous.addEventListener('click', () => scrollToStyle(styles, Number(styles.dataset.index ?? 0) - 1));
  next.addEventListener('click', () => scrollToStyle(styles, Number(styles.dataset.index ?? 0) + 1));
  update(Number(styles.dataset.index ?? 0));
  thumbnail.append(previous, next, pips);
  return { update };
}

function arrowButton(className: string, label: string, path: string) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.setAttribute('aria-label', label);
  button.innerHTML = `<svg viewBox="0 0 256 512" width="10" height="12" aria-hidden="true"><path fill="currentColor" d="${path}"/></svg>`;
  return button;
}
