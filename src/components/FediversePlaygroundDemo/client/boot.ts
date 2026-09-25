import { watchDrawingNote } from '@/client/drawingNote';
import { watchPageActive } from '@/client/frontPage';

export async function boot(host: HTMLElement) {
  const [{ initPlayground }, { createPlayer }] = await Promise.all([import('./playground'), import('./autoplay')]);
  const restore = initPlayground(host);
  if (!restore) return;

  const player = createPlayer(host, restore);
  const page = host.closest<HTMLElement>('article.technical-drawing-stack > * > section') ?? host;
  watchPageActive(page, (active) => player.setActive(active));
  watchDrawingNote(page, (open) => player.setNoteOpen(open));
}
