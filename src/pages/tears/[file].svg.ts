import type { APIRoute, GetStaticPaths } from 'astro';

import { TEAR_IMAGES } from '@/components/OpenSourceContributions/tear';

export const prerender = true;

export const getStaticPaths = (() =>
  Object.keys(TEAR_IMAGES).map((file) => ({ params: { file } }))) satisfies GetStaticPaths;

export const GET: APIRoute = ({ params }) =>
  new Response(TEAR_IMAGES[params.file!], { headers: { 'content-type': 'image/svg+xml' } });
