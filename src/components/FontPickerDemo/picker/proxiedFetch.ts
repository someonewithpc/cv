export const proxyPrefix = '/api/font-proxy?url=';

export function proxiedFetch(url: string, { signal }: { signal?: AbortSignal } = {}) {
  return fetch(proxyPrefix + encodeURIComponent(url), { signal });
}
