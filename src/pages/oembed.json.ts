import { env } from 'cloudflare:workers';

import type { APIRoute } from 'astro';

import { AUTHOR_NAME, SITE_TITLE, SITE_URL } from '@/site';

export const prerender = false;

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const FALLBACK_CARD = `<strong>${escapeHtml(SITE_TITLE)}</strong><br>${escapeHtml(AUTHOR_NAME)}`;

// The card embeds this snippet directly, not the live page: hsal.es is a full interactive
// site (demos, canvases, drag-and-drop), and without an explicit "rich" html a consumer that
// wants a visual preview will fall back to iframing the raw url, which tries to run all of it
// inside a tiny frame. The snippet itself is OEmbedCard.astro, prerendered once at build time
// to /oembed-card.html and read back here through the assets binding.
const DEFAULT_WIDTH = 360;
const DEFAULT_HEIGHT = 120;
const MIN_SIZE = 60;

const clamp = (requested: number | null, fallback: number) =>
  requested && Number.isFinite(requested) ? Math.max(MIN_SIZE, Math.min(fallback, requested)) : fallback;

export const GET: APIRoute = async ({ url }) => {
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

  const cardResponse = await env.ASSETS.fetch(new URL('/oembed-card.html/', url));
  const card = cardResponse.ok ? await cardResponse.text() : FALLBACK_CARD;
  const html = `<a href="${SITE_URL}" style="text-decoration:none;color:inherit">${card}</a>`;

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
