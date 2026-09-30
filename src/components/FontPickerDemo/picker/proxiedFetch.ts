export const proxyPrefix = '/api/font-proxy?url=';

// Every request through the proxy spends the site's daily budget, so a page load gets a
// fixed allowance, each response a size and each request a deadline. Tripping one fails the
// load the way a bad name does, with the subform's error border
export const LIMITS = {
  requests: 100,
  sessionBytes: 16 * 1024 * 1024,
  responseBytes: 2 * 1024 * 1024,
  timeoutMs: 10_000,
};

export class FetchCapError extends Error {}

const spent = { requests: 0, bytes: 0 };

export function resetSpent() {
  spent.requests = 0;
  spent.bytes = 0;
}

export type CappedResponse = { ok: boolean, status: number, contentType: string, text: () => Promise<string> };

async function readCapped(res: Response): Promise<string> {
  const declared = Number(res.headers.get('content-length'));
  if (declared > LIMITS.responseBytes) {
    await res.body?.cancel();
    throw new FetchCapError('Response too large');
  }
  if (!res.body) return '';

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let read = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    read += value.byteLength;
    spent.bytes += value.byteLength;
    if (read > LIMITS.responseBytes || spent.bytes > LIMITS.sessionBytes) {
      await reader.cancel();
      throw new FetchCapError('Response too large');
    }
    chunks.push(value);
  }

  const decoder = new TextDecoder();
  return chunks.map((chunk) => decoder.decode(chunk, { stream: true })).join('') + decoder.decode();
}

/** fetch() under the limits above; `direct` skips the proxy but keeps the limits */
export async function cappedFetch(url: string, { signal, direct = false }: { signal?: AbortSignal, direct?: boolean } = {}): Promise<CappedResponse> {
  if (spent.requests >= LIMITS.requests || spent.bytes >= LIMITS.sessionBytes) throw new FetchCapError('Fetch allowance spent');
  spent.requests += 1;

  const deadline = AbortSignal.timeout(LIMITS.timeoutMs);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const timedOut = (error: unknown) => {
    if (deadline.aborted && !signal?.aborted) throw new FetchCapError('Timed out');
    throw error;
  };

  const res = await fetch(direct ? url : proxyPrefix + encodeURIComponent(url), { signal: combined }).catch(timedOut);
  return {
    ok: res.ok,
    status: res.status,
    contentType: res.headers.get('content-type') ?? '',
    text: () => readCapped(res).catch(timedOut),
  };
}

export function proxiedFetch(url: string, { signal }: { signal?: AbortSignal } = {}) {
  return cappedFetch(url, { signal });
}
