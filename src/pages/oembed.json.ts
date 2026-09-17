import type { APIRoute } from 'astro';

import { OEMBED_CARD_HTML } from '@/generated/oembedCard';
import { AUTHOR_NAME, SITE_TITLE, SITE_URL } from '@/site';

export const prerender = false;

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

// The card embeds this snippet directly, not the live page: hsal.es is a full interactive
// site (demos, canvases, drag-and-drop), and without an explicit "rich" html a consumer that
// wants a visual preview will fall back to iframing the raw url, which tries to run all of it
// inside a tiny frame. OEMBED_CARD_HTML is OEmbedCard.astro's own rendered output, generated
// at build time by scripts/render-oembed-card.mjs.
const DEFAULT_WIDTH = 360;
const DEFAULT_HEIGHT = 150;
const MIN_SIZE = 60;

const clamp = (requested: number | null, fallback: number) =>
  requested && Number.isFinite(requested) ? Math.max(MIN_SIZE, Math.min(fallback, requested)) : fallback;

export const GET: APIRoute = ({ url }) => {
  const format = url.searchParams.get('format') ?? 'json';
  if (format !== 'json') {
    return jsonResponse({ error: 'Only the json format is supported' }, 501);
  }

  const requestedUrl = url.searchParams.get('url');
  if (requestedUrl) {
    let target: URL;
    try {
      target = new URL(requestedUrl);
    } catch {
      return jsonResponse({ error: 'Invalid url' }, 400);
    }
    if (target.origin !== SITE_URL || target.pathname !== '/') {
      return jsonResponse({ error: 'No oEmbed representation for that url' }, 404);
    }
  }

  const width = clamp(Number(url.searchParams.get('maxwidth')) || null, DEFAULT_WIDTH);
  const height = clamp(Number(url.searchParams.get('maxheight')) || null, DEFAULT_HEIGHT);

  const html = OEMBED_CARD_HTML;

  return jsonResponse({
    version: '1.0',
    type: 'rich',
    title: SITE_TITLE,
    author_name: AUTHOR_NAME,
    width,
    height,
    html,
  });
};
