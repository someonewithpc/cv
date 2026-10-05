import type { APIRoute } from 'astro';

import { oembedFields } from '@/oembed';

export const prerender = true;

export const GET: APIRoute = async () => Response.json(await oembedFields());
