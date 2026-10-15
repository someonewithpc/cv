import type { APIRoute } from 'astro';

import { escapeHtml } from '@/escapeHtml';
import { oembedFields } from '@/oembed';

export const prerender = true;

export const GET: APIRoute = async () => {
  const fields = Object.entries(await oembedFields()).map(([key, value]) => `\t<${key}>${escapeHtml(value)}</${key}>`);
  const xml = ['<?xml version="1.0" encoding="utf-8" standalone="yes"?>', '<oembed>', ...fields, '</oembed>', ''].join('\n');
  return new Response(xml, { headers: { 'content-type': 'text/xml; charset=utf-8' } });
};
