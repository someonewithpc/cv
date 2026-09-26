import { watchDrawingNote } from '@/client/drawingNote';
import { demoGate } from '@/client/frontPage';

export async function boot(host: HTMLElement) {
  const [{ initPlayground }, { createPlayer }] = await Promise.all([import('./playground'), import('./autoplay')]);
  const restore = initPlayground(host);
  if (!restore) return;

  const page = host.closest<HTMLElement>('article.technical-drawing-stack > * > section') ?? host;
  const gate = demoGate(page);
  const player = createPlayer(host, restore, gate);
  gate.onChange((active) => player.setActive(active));
  watchDrawingNote(page, (open) => player.setNoteOpen(open));
}
