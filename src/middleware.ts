import { defineMiddleware } from 'astro:middleware';

/* Astro renders sibling components concurrently, so a PostIt cannot count itself into
   page order. It marks itself instead, and the finished page hands the papers out here.
   Each drawing stack with notes starts one paper further along than the one before, and
   its sheets take the papers in turn, so the front notes down the page differ and so do
   the notes met while turning sheets. No demo picks one; a new demo needs no change. */
const PAPERS = ['peeled', 'taped'];
const MARK = 'data-paper="next"';
const STACK_OR_MARK = /class="technical-drawing-frame\b|data-paper="next"/g;

export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next();
  if (!response.headers.get('content-type')?.startsWith('text/html')) return response;

  const html = await response.text();
  let stack = -1;
  let note = 0;
  let newStack = true;
  const papered = html.replace(STACK_OR_MARK, (match) => {
    if (match !== MARK) {
      newStack = true;
      return match;
    }
    if (newStack) {
      stack += 1;
      note = 0;
      newStack = false;
    }
    return `data-paper="${PAPERS[(stack + note++) % PAPERS.length]}"`;
  });

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(papered, { status: response.status, statusText: response.statusText, headers });
});
