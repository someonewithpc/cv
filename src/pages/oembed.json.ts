import type { APIRoute } from 'astro';

import { AUTHOR_NAME, SITE_TITLE, SITE_URL } from '@/site';

export const prerender = false;

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

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

  return jsonResponse({
    version: '1.0',
    type: 'link',
    title: SITE_TITLE,
    author_name: AUTHOR_NAME,
  });
};
