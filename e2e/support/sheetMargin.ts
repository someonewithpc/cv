import type { Locator } from '@playwright/test';

/**
 * Every sheet keeps clear sheet around its content: each layer's root pads by the one token in
 * layers/_sheet.scss, in em of the sheet's own type, so whatever it paints stays off the frame
 * line, the title block and the note's tab. The floor here is what the review asked for.
 */
export const SHEET_MARGIN_EM = 0.5;

export const SHEET_VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

export type ClearSheetOptions = {
  /** Selector for what a walkthrough paints where it likes: its cursor, its toasts. */
  skip: string;
  /** Count a box only where it shows: a list scrolls inside the sheet, and a card scrolled out paints nothing. */
  clipToScrollers?: boolean;
  /** Take an Annotations overlay's ink to be its callouts, since the overlay is twice its artwork's size by design. */
  annotationInk?: boolean;
};

/**
 * The least clear sheet, in px, between anything the front sheet paints and its frame line
 * (`toFrame`) or its title block and note tab (`toPieces`), against the margin the sheet's
 * type sets. `outside` lists the layer's text runs that sit past the frame line.
 */
export function clearSheet(front: Locator, options: ClearSheetOptions) {
  return front.evaluate((wrapper, { marginEm, skip, clipToScrollers, annotationInk }) => {
    const section = wrapper.querySelector(':scope > section')!;
    const root = section.querySelector(':scope > .content > *') as HTMLElement;
    const margin = marginEm * parseFloat(getComputedStyle(root).fontSize);

    // The frame line is drawn one pixel wide on the inside of the mat
    const style = getComputedStyle(section);
    const mat = parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft) + 1;
    const sheet = section.getBoundingClientRect();
    const frame = { left: sheet.left + mat, top: sheet.top + mat, right: sheet.right - mat, bottom: sheet.bottom - mat };

    const pieces = ['table', '.note-fold']
      .map((s) => section.querySelector(`:scope > ${s}, :scope > .aside > ${s}`)?.getBoundingClientRect())
      .filter((r): r is DOMRect => !!r && r.width > 0 && r.height > 0);

    // What paints: text, form controls, a drawing, or a box with a fill or a border. Grid
    // and flex wrappers do not, and a wrapper spanning the sheet says nothing about where
    // the ink is.
    const paints = (el: Element) => {
      if (el.closest(skip)) return false;
      if (el instanceof SVGElement) {
        if (annotationInk && el.closest('svg[data-annotations]')) return el.tagName === 'path' || el.tagName === 'text';
        return el.tagName === 'svg';
      }
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.display === 'contents' || cs.visibility === 'hidden') return false;
      if (['INPUT', 'SELECT', 'BUTTON', 'TEXTAREA', 'IMG'].includes(el.tagName)) return true;
      if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0) return true;
      return [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim());
    };
    const visible = (el: Element) => {
      const b = el.getBoundingClientRect();
      const r = { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
      if (!clipToScrollers) return r;
      for (let a = el.parentElement; a && a !== root.parentElement; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
        const c = a.getBoundingClientRect();
        r.left = Math.max(r.left, c.left);
        r.top = Math.max(r.top, c.top);
        r.right = Math.min(r.right, c.right);
        r.bottom = Math.min(r.bottom, c.bottom);
      }
      return r;
    };
    const boxes = [...root.querySelectorAll('*')]
      .filter(paints)
      .map(visible)
      .filter((r) => r.right > r.left && r.bottom > r.top);

    const toFrame = Math.min(...boxes.map((r) => Math.min(
      r.left - frame.left, frame.right - r.right, r.top - frame.top, frame.bottom - r.bottom,
    )));
    const toPieces = Math.min(...boxes.flatMap((r) => pieces.map((p) => Math.max(
      p.left - r.right, r.left - p.right, p.top - r.bottom, r.top - p.bottom,
    ))));

    // Every run of the layer's text, wherever it is drawn from: a readout portalled into the
    // section sits past the root the boxes above come from. The section's own furniture (title
    // block, note tab, transport deck, the screen-reader labels) is not the layer's.
    const outside: string[] = [];
    const furniture = `.sr-only, table, .aside, .note-fold, [data-demo-transport], ${skip}`;
    const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent!.trim();
      if (!text || node.parentElement?.closest(furniture)) continue;
      range.selectNodeContents(node);
      for (const r of range.getClientRects()) {
        if (r.width === 0 || r.height === 0) continue;
        if (r.left < frame.left || r.right > frame.right || r.top < frame.top || r.bottom > frame.bottom) {
          outside.push(text);
          break;
        }
      }
    }
    return { margin, boxes: boxes.length, toFrame, toPieces, outside };
  }, { marginEm: SHEET_MARGIN_EM, ...options });
}
