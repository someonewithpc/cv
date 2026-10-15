import { demoGate } from '@/client/frontPage';
import { drawingPageOf } from '@/client/drawingPage';

export async function boot(host: HTMLElement) {
  const [{ initPlayground }, { createPlayer }] = await Promise.all([import('./playground'), import('./autoplay')]);
  const restore = initPlayground(host);
  if (!restore) return;

  const page = drawingPageOf(host) ?? host;
  const gate = demoGate(page);
  const player = createPlayer(host, restore, gate);
  gate.onChange((active) => player.setActive(active));
}
