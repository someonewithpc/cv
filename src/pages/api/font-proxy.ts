import type { APIRoute } from 'astro';

export const prerender = false;

const MAX_BYTES = 8 * 1024 * 1024;

// text/html and text/css for page/stylesheet extraction, the rest for the font files themselves
const ALLOWED_CONTENT_TYPES = /^(text\/(css|html)|font\/|application\/(x-)?font|application\/octet-stream|binary\/octet-stream)/i;

function validateTarget(raw: string): URL {
  const target = new URL(raw);

  if (!['http:', 'https:'].includes(target.protocol)) {
    throw new Error('Only http(s) URLs are supported');
  }

  const host = target.hostname.toLowerCase();
  const isIpLiteral = host.startsWith('[') || /^\d+(\.\d+){3}$/.test(host);
  if (
    isIpLiteral
    || host === 'localhost'
    || host.endsWith('.localhost')
    || host.endsWith('.local')
    || host.endsWith('.internal')
  ) {
    throw new Error('Refusing to fetch private addresses');
  }

  return target;
}

export const GET: APIRoute = async ({ url, request }) => {
  // The picker is the only caller, and it fetches from this origin. A browser says where a
  // request came from in sec-fetch-site; one from another site's page is not the picker's,
  // and is turned away before the upstream fetch it would have cost. A client that sends no
  // header at all (curl, an older browser) is not told apart here.
  const site = request.headers.get('sec-fetch-site');
  if (site !== null && site !== 'same-origin' && site !== 'none') {
    return new Response('Cross-site requests are not served', { status: 403 });
  }

  const raw = url.searchParams.get('url');
  if (!raw) return new Response('Missing url parameter', { status: 400 });

  let target: URL;
  try {
    target = validateTarget(raw);
  } catch (e) {
    return new Response(e instanceof Error ? e.message : 'Invalid URL', { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      headers: {
        accept: request.headers.get('accept') ?? '*/*',
        // Pass the browser's UA through so e.g. Google Fonts serves modern woff2 CSS
        'user-agent': request.headers.get('user-agent') ?? 'cv-font-picker-demo',
        'accept-language': request.headers.get('accept-language') ?? 'en',
      },
      redirect: 'follow',
    });
  } catch (e) {
    return new Response('Upstream fetch failed: ' + (e instanceof Error ? e.message : String(e)), { status: 502 });
  }

  const contentType = upstream.headers.get('content-type') ?? '';
  if (!ALLOWED_CONTENT_TYPES.test(contentType)) {
    return new Response('Unsupported content type', { status: 415 });
  }

  const declaredLength = Number(upstream.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_BYTES) {
    return new Response('Response too large', { status: 413 });
  }

  const body = await upstream.arrayBuffer();
  if (body.byteLength > MAX_BYTES) {
    return new Response('Response too large', { status: 413 });
  }

  return new Response(body, {
    status: upstream.status,
    headers: {
      'content-type': contentType,
      'cache-control': 'public, max-age=3600',
      // The embed mode fetches whole pages, so text/html comes back through here, and a
      // browser pointed straight at this URL would run that page's scripts as this origin.
      // A sandboxed document gets an opaque origin instead. fetch().text() and FontFace
      // loads, which are what the picker does with the body, never look at the policy.
      'content-security-policy': 'sandbox',
      'x-content-type-options': 'nosniff',
      // No access-control-allow-origin: every caller is same-origin, and the wildcard let
      // any page on the web read fetched bodies through this worker's quota.
    },
  });
};
