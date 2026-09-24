import { expect, test } from '@playwright/test';

import { GET } from '../src/pages/api/font-proxy';
import { isInternalAddress } from '../src/server/internalAddress';

// Drives the endpoint's GET in the test process with fetch replaced, so neither the DNS
// lookups nor the upstream requests leave the machine. A scripted upstream counts what the
// proxy read from each body and whether it cancelled it.

const MB = 1024 * 1024;
const CHUNK = 64 * 1024;

interface Upstream {
  status?: number,
  headers?: Record<string, string>,
  bytes?: number,
}

interface Served {
  url: string,
  redirect: RequestRedirect | undefined,
  bytesRead: number,
  cancelled: boolean,
}

function harness(dns: Record<string, string[]>, upstreams: Record<string, Upstream>) {
  const served: Served[] = [];
  const lookups: { name: string, type: string, accept: string | null }[] = [];

  async function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.origin === 'https://cloudflare-dns.com') {
      const name = url.searchParams.get('name')!;
      const type = url.searchParams.get('type')!;
      lookups.push({ name, type, accept: new Headers(init?.headers).get('accept') });
      if (name === 'dns-down.test') return new Response('', { status: 503 });
      const answers = (dns[name] ?? [])
        .filter((address) => address.includes(':') === (type === 'AAAA'))
        .map((data) => ({ name, type: type === 'A' ? 1 : 28, TTL: 60, data }));
      return Response.json({ Status: dns[name] ? 0 : 3, Answer: answers });
    }

    const upstream = upstreams[url.toString()];
    if (!upstream) throw new Error(`test fetched an unscripted URL: ${url}`);
    const record: Served = { url: url.toString(), redirect: init?.redirect, bytesRead: 0, cancelled: false };
    served.push(record);
    let left = upstream.bytes ?? 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (left === 0) return controller.close();
        const size = Math.min(CHUNK, left);
        left -= size;
        record.bytesRead += size;
        controller.enqueue(new Uint8Array(size));
      },
      cancel() {
        record.cancelled = true;
      },
    }, { highWaterMark: 0 });
    return new Response(body, { status: upstream.status ?? 200, headers: upstream.headers });
  }

  return { served, lookups, fakeFetch };
}

let realFetch: typeof fetch;
test.beforeEach(() => {
  realFetch = globalThis.fetch;
});
test.afterEach(() => {
  globalThis.fetch = realFetch;
});

async function proxy(
  setup: ReturnType<typeof harness>,
  target: string | null,
  headers: Record<string, string> = { 'sec-fetch-site': 'same-origin' },
): Promise<Response> {
  globalThis.fetch = setup.fakeFetch as typeof fetch;
  const url = new URL('https://cv.test/api/font-proxy');
  if (target !== null) url.searchParams.set('url', target);
  const request = new Request(url, { headers });
  return GET({ url, request } as Parameters<typeof GET>[0]) as Promise<Response>;
}

const CSS = { 'content-type': 'text/css' };
const PUBLIC = { 'fonts.test': ['93.184.215.14', '2606:2800:21f:cb07:6820:80da:af6b:8b2c'] };

test.describe('font proxy', () => {
  test('refuses a cross-site caller before any lookup or fetch', async () => {
    const setup = harness(PUBLIC, { 'https://fonts.test/a.css': { headers: CSS } });
    const response = await proxy(setup, 'https://fonts.test/a.css', { 'sec-fetch-site': 'cross-site' });
    expect(response.status).toBe(403);
    expect(setup.lookups).toEqual([]);
    expect(setup.served).toEqual([]);
  });

  test('refuses a missing, malformed or non-http url with a 400', async () => {
    for (const target of [null, 'not a url', 'ftp://fonts.test/a.css', 'file:///etc/passwd']) {
      const setup = harness(PUBLIC, {});
      expect((await proxy(setup, target)).status, String(target)).toBe(400);
      expect(setup.lookups).toEqual([]);
    }
  });

  test('refuses IP literals and local names by their text', async () => {
    for (const target of [
      'http://127.0.0.1/', 'http://2130706433/', 'http://[::1]/', 'http://localhost/',
      'http://printer.local/', 'http://metadata.google.internal/',
    ]) {
      const setup = harness(PUBLIC, {});
      expect((await proxy(setup, target)).status, target).toBe(400);
      expect(setup.served).toEqual([]);
    }
  });

  test('refuses a public name that resolves to an internal address, never fetching it', async () => {
    for (const address of [
      '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', // the Rails proxy's private?
      'fc00::1', 'fd12:3456::1', '::ffff:10.0.0.1', '::ffff:c0a8:101',
      '127.0.0.1', '127.8.8.8', '0.0.0.0', '169.254.169.254', '100.64.0.1', '192.0.0.8',
      '198.18.0.1', '224.0.0.1', '255.255.255.255',
      '::', '::1', 'fe80::1', 'fec0::1', 'ff02::1',
      '::ffff:127.0.0.1', '::ffff:a9fe:a9fe', '::127.0.0.1', '64:ff9b::a9fe:a9fe',
      'not-an-address',
    ]) {
      const setup = harness({ 'evil.test': [address] }, { 'https://evil.test/a.css': { headers: CSS } });
      const response = await proxy(setup, 'https://evil.test/a.css');
      expect(response.status, address).toBe(400);
      expect(await response.text(), address).toBe('Refusing to fetch private addresses');
      expect(setup.served, address).toEqual([]);
    }
  });

  test('refuses a name when any one of its addresses is internal', async () => {
    const setup = harness({ 'mixed.test': ['93.184.215.14', '::1'] }, { 'https://mixed.test/': { headers: CSS } });
    expect((await proxy(setup, 'https://mixed.test/')).status).toBe(400);
    expect(setup.served).toEqual([]);
  });

  test('refuses a name that does not resolve, and answers 502 when the lookup itself fails', async () => {
    const nx = harness({}, {});
    const response = await proxy(nx, 'https://nowhere.test/');
    expect(response.status).toBe(400);
    expect(await response.text()).toBe('Host does not resolve');

    const down = harness({}, {});
    expect((await proxy(down, 'https://dns-down.test/')).status).toBe(502);
    expect(down.served).toEqual([]);
  });

  test('looks up A and AAAA over DNS-over-HTTPS and serves a public name', async () => {
    const setup = harness(PUBLIC, { 'https://fonts.test/a.css': { headers: CSS, bytes: 3 * MB } });
    const response = await proxy(setup, 'https://fonts.test/a.css');
    expect(response.status).toBe(200);
    expect((await response.arrayBuffer()).byteLength).toBe(3 * MB);
    expect(response.headers.get('content-type')).toBe('text/css');
    expect(response.headers.get('content-security-policy')).toBe('sandbox');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(setup.lookups.map(({ type }) => type).sort()).toEqual(['A', 'AAAA']);
    expect(setup.lookups.every(({ name, accept }) => name === 'fonts.test' && accept === 'application/dns-json')).toBe(true);
    expect(setup.served[0].redirect).toBe('manual');
  });

  test('also serves a direct call with no sec-fetch-site header, and a typed-in one', async () => {
    for (const headers of [{}, { 'sec-fetch-site': 'none' }]) {
      const setup = harness(PUBLIC, { 'https://fonts.test/a.css': { headers: CSS, bytes: 10 } });
      expect((await proxy(setup, 'https://fonts.test/a.css', headers)).status).toBe(200);
    }
  });

  test('follows public redirects by hand, looking up every hop', async () => {
    const setup = harness(
      { ...PUBLIC, 'cdn.test': ['2606:4700::6810:84e5'] },
      {
        'https://fonts.test/a.css': { status: 301, headers: { location: 'https://cdn.test/b.css' }, bytes: 100 },
        'https://cdn.test/b.css': { status: 302, headers: { location: '/c.css' }, bytes: 100 },
        'https://cdn.test/c.css': { headers: CSS, bytes: 10 },
      },
    );
    const response = await proxy(setup, 'https://fonts.test/a.css');
    expect(response.status).toBe(200);
    expect(setup.served.map(({ url }) => url)).toEqual([
      'https://fonts.test/a.css', 'https://cdn.test/b.css', 'https://cdn.test/c.css',
    ]);
    expect(setup.served.every(({ redirect }) => redirect === 'manual')).toBe(true);
    expect(setup.served.slice(0, 2).every(({ cancelled }) => cancelled)).toBe(true);
    expect(setup.lookups.filter(({ name }) => name === 'cdn.test')).toHaveLength(4);
  });

  test('answers 400 for a redirect to a name that resolves internally, never fetching it', async () => {
    const setup = harness(
      { ...PUBLIC, 'rebound.test': ['169.254.169.254'] },
      {
        'https://fonts.test/a.css': { status: 302, headers: { location: 'http://rebound.test/latest/meta-data/' }, bytes: 100 },
        'http://rebound.test/latest/meta-data/': { headers: CSS },
      },
    );
    const response = await proxy(setup, 'https://fonts.test/a.css');
    expect(response.status).toBe(400);
    expect(await response.text()).toBe('Refusing to fetch private addresses');
    expect(setup.served.map(({ url }) => url)).toEqual(['https://fonts.test/a.css']);
    expect(setup.served[0].cancelled).toBe(true);
  });

  test('answers 400 for a redirect to an IP literal or a non-http scheme', async () => {
    for (const location of ['http://169.254.169.254/', 'http://[fd00::1]/', 'file:///etc/passwd']) {
      const setup = harness(PUBLIC, {
        'https://fonts.test/a.css': { status: 302, headers: { location } },
      });
      expect((await proxy(setup, 'https://fonts.test/a.css')).status, location).toBe(400);
      expect(setup.served).toHaveLength(1);
    }
  });

  test('stops a redirect loop after six fetches, cancelling every 3xx body', async () => {
    const setup = harness(PUBLIC, {
      'https://fonts.test/a.css': { status: 302, headers: { location: '/b.css' }, bytes: 100 },
      'https://fonts.test/b.css': { status: 302, headers: { location: '/a.css' }, bytes: 100 },
    });
    const response = await proxy(setup, 'https://fonts.test/a.css');
    expect(response.status).toBe(502);
    expect(await response.text()).toContain('Too many redirects');
    expect(setup.served).toHaveLength(6);
    expect(setup.served.every(({ cancelled }) => cancelled)).toBe(true);
  });

  test('stops reading a chunked body just past the 8 MB cap', async () => {
    const setup = harness(PUBLIC, { 'https://fonts.test/big.woff2': { headers: { 'content-type': 'font/woff2' }, bytes: 64 * MB } });
    const response = await proxy(setup, 'https://fonts.test/big.woff2');
    expect(response.status).toBe(413);
    expect(setup.served[0].cancelled).toBe(true);
    expect(setup.served[0].bytesRead).toBeGreaterThan(8 * MB);
    expect(setup.served[0].bytesRead).toBeLessThanOrEqual(8 * MB + 2 * CHUNK);
  });

  test('refuses a declared length over the cap without reading the body', async () => {
    const setup = harness(PUBLIC, {
      'https://fonts.test/big.woff2': {
        headers: { 'content-type': 'font/woff2', 'content-length': String(9 * MB) },
        bytes: 9 * MB,
      },
    });
    const response = await proxy(setup, 'https://fonts.test/big.woff2');
    expect(response.status).toBe(413);
    expect(setup.served[0].cancelled).toBe(true);
    expect(setup.served[0].bytesRead).toBeLessThanOrEqual(CHUNK);
  });

  test('answers 415 for an unsupported content type, cancelling the body', async () => {
    const setup = harness(PUBLIC, { 'https://fonts.test/x.js': { headers: { 'content-type': 'text/javascript' }, bytes: MB } });
    const response = await proxy(setup, 'https://fonts.test/x.js');
    expect(response.status).toBe(415);
    expect(setup.served[0].cancelled).toBe(true);
    expect(setup.served[0].bytesRead).toBeLessThanOrEqual(CHUNK);
  });

  test('lets public addresses through, mapped and NAT64 forms included', () => {
    for (const address of [
      '8.8.8.8', '93.184.215.14', '172.32.0.1', '100.128.0.1', '2606:4700::1111',
      '::ffff:8.8.8.8', '64:ff9b::808:808', '2001:db8::1',
    ]) {
      expect(isInternalAddress(address), address).toBe(false);
    }
  });
});
