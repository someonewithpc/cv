import type { APIRoute } from 'astro';

import { type Meter, UPSTREAM_BYTES_HEADER } from '../../server/fontProxyBudget';
import { isInternalAddress, resolveHost } from '../../server/internalAddress';

export const prerender = false;

const MAX_BYTES = 8 * 1024 * 1024;
// Google Fonts answers in one hop and a page's stylesheet in at most a couple; a chain past
// this is not a font.
const MAX_REDIRECTS = 5;

// text/html and text/css for page/stylesheet extraction, the rest for the font files themselves
const ALLOWED_CONTENT_TYPES = /^(text\/(css|html)|font\/|application\/(x-)?font|application\/octet-stream|binary\/octet-stream)/i;

// A target this endpoint will not fetch. The caller asked for it, so it answers 400 on any hop;
// other errors on the way are the upstream's and answer 502.
class Refused extends Error {}

function validateTarget(raw: string, base?: URL): URL {
  let target: URL;
  try {
    target = new URL(raw, base);
  } catch {
    throw new Refused('Invalid URL');
  }

  if (!['http:', 'https:'].includes(target.protocol)) {
    throw new Refused('Only http(s) URLs are supported');
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
    throw new Refused('Refusing to fetch private addresses');
  }

  return target;
}

// The hostname text above says nothing about where a public name points: one resolving to
// 127.0.0.1 or 169.254.169.254 passed it. This looks the name up and refuses it if any address
// is internal, or if there is none, as the Rails proxy did.
//
// fetch() then resolves the name again on its own, and Workers offer no way to pin it to the
// address checked here. A name that answers this lookup with a public address and the next with
// a private one (DNS rebinding, TTL 0) still gets through. Deployed Workers cannot reach
// private addresses anyway, so the gap is open only under astro dev and preview.
async function refuseInternal(target: URL, meter: Meter): Promise<void> {
  const addresses = await resolveHost(target.hostname, meter);
  if (addresses.length === 0) throw new Refused('Host does not resolve');
  if (addresses.some(isInternalAddress)) throw new Refused('Refusing to fetch private addresses');
}

/**
 * Fetches the target, following redirects by hand so every hop passes validateTarget and
 * refuseInternal: with redirect 'follow' only the first URL was checked, and the one it
 * redirected to could be anything.
 */
async function fetchFollowingRedirects(target: URL, headers: HeadersInit, meter: Meter): Promise<Response> {
  for (let hop = 0; ; hop += 1) {
    await refuseInternal(target, meter);
    const upstream = await fetch(target, { headers, redirect: 'manual' });
    const location = upstream.headers.get('location');
    if (upstream.status < 300 || upstream.status > 399 || !location) return upstream;
    await upstream.body?.cancel();
    if (hop === MAX_REDIRECTS) throw new Error('Too many redirects');
    target = validateTarget(location, target);
  }
}

/**
 * Reads the body up to the cap. Past it the read is cancelled, so a chunked response with no
 * content-length, which the header check cannot judge, costs the worker at most one chunk
 * over the cap rather than the whole thing; arrayBuffer() pulled it all before measuring.
 * null when the body was over the cap. Every chunk read goes on the meter, the one past the cap
 * too.
 */
async function readUpTo(body: ReadableStream<Uint8Array> | null, limit: number, meter: Meter): Promise<ArrayBuffer | null> {
  if (!body) return new ArrayBuffer(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    meter.bytes += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out.buffer;
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
    if (e instanceof Refused) return new Response(e.message, { status: 400 });
    throw e;
  }

  // Everything after this point has cost upstream traffic, so every answer names it.
  const meter: Meter = { bytes: 0 };
  const metered = (body: BodyInit | null, init: ResponseInit): Response => {
    const response = new Response(body, init);
    response.headers.set(UPSTREAM_BYTES_HEADER, String(meter.bytes));
    return response;
  };

  let upstream: Response;
  try {
    upstream = await fetchFollowingRedirects(target, {
      accept: request.headers.get('accept') ?? '*/*',
      // Pass the browser's UA through so e.g. Google Fonts serves modern woff2 CSS
      'user-agent': request.headers.get('user-agent') ?? 'cv-font-picker-demo',
      'accept-language': request.headers.get('accept-language') ?? 'en',
    }, meter);
  } catch (e) {
    if (e instanceof Refused) return metered(e.message, { status: 400 });
    return metered('Upstream fetch failed: ' + (e instanceof Error ? e.message : String(e)), { status: 502 });
  }

  const contentType = upstream.headers.get('content-type') ?? '';
  if (!ALLOWED_CONTENT_TYPES.test(contentType)) {
    await upstream.body?.cancel();
    return metered('Unsupported content type', { status: 415 });
  }

  const declaredLength = Number(upstream.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_BYTES) {
    await upstream.body?.cancel();
    return metered('Response too large', { status: 413 });
  }

  const body = await readUpTo(upstream.body, MAX_BYTES, meter);
  if (body === null) {
    return metered('Response too large', { status: 413 });
  }

  return metered(body, {
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
