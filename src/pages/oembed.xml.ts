import type { APIRoute } from 'astro';

import { oembedFields } from '@/oembed';

export const prerender = true;

const escape = (value: string | number) =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const GET: APIRoute = async () => {
  const fields = Object.entries(await oembedFields()).map(([key, value]) => `\t<${key}>${escape(value)}</${key}>`);
  const xml = ['<?xml version="1.0" encoding="utf-8" standalone="yes"?>', '<oembed>', ...fields, '</oembed>', ''].join('\n');
  return new Response(xml, { headers: { 'content-type': 'text/xml; charset=utf-8' } });
};
