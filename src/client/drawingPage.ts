/** The sheet of a technical drawing stack that holds `el`, or null outside one. */
export const drawingPageOf = (el: Element | null | undefined) =>
  el?.closest<HTMLElement>('article.technical-drawing-stack > * > section') ?? null;
