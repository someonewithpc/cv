import type { APIRoute } from 'astro';

import { AUTHOR_NAME, SITE_TITLE, SITE_URL } from '@/site';

export const prerender = false;

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// The card embeds this snippet directly, not the live page: hsal.es is a full interactive
// site (demos, canvases, drag-and-drop), and without an explicit "rich" html a consumer that
// wants a visual preview will fall back to iframing the raw url, which tries to run all of it
// inside a tiny frame.
const DEFAULT_WIDTH = 360;
const DEFAULT_HEIGHT = 80;
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

  const html =
    `<a href="${SITE_URL}" style="display:block;font-family:system-ui,sans-serif;` +
    `color:inherit;text-decoration:none;line-height:1.4">` +
    `<strong>${escapeHtml(SITE_TITLE)}</strong><br>${escapeHtml(AUTHOR_NAME)}</a>`;

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
