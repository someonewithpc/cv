// The Worker's own routes. Static files are left to the assets layer, case-sensitive.
const SERVER_ROUTES = ['/api/font-proxy', '/oembed.json'];

// Decoded, single slashes, lower case: the one spelling every server-side path check reads.
export function canonicalPath(pathname: string): string {
  let path = pathname;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    // A malformed escape is judged as written.
  }
  return path.replace(/\/{2,}/g, '/').toLowerCase();
}

function isServerRoute(path: string): boolean {
  return SERVER_ROUTES.some((route) => path === route || path === `${route}/`);
}

// A server route spelt any other way is handed on in its canonical spelling, so the gate and
// Astro's router see the same path. Any other path goes on as written.
export function canonicalRequest(request: Request): Request {
  const url = new URL(request.url);
  const path = canonicalPath(url.pathname);
  if (path === url.pathname || !isServerRoute(path)) return request;
  url.pathname = path;
  return new Request(url, request);
}
