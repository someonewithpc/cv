/**
 * The note dialog covers its own drawing page while it is open, so anything
 * animating underneath should hold still until the note is folded away again.
 * CSS animations are paused by TechnicalDrawing/Page.astro; scripted demos
 * (rAF loops, autoplay) subscribe here.
 */
export function watchDrawingNote(root: Element, onToggle: (open: boolean) => void) {
  const page = root.closest('article.technical-drawing-stack > * > section');
  const dialog = page?.querySelector<HTMLDialogElement>('dialog.drawing-note');
  if (!dialog) return () => {};

  const update = () => onToggle(dialog.open);
  dialog.addEventListener('toggle', update);
  dialog.addEventListener('close', update);

  return () => {
    dialog.removeEventListener('toggle', update);
    dialog.removeEventListener('close', update);
  };
}
