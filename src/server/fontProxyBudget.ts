// What the font proxy may relay in one UTC day before it answers 503 until midnight.
export const DAILY_BYTES = 1024 ** 3;

export interface Budget {
  spent(): Promise<number>;
  add(bytes: number): Promise<void>;
}

export interface Budgets {
  getByName(name: string): Budget;
}

// Namespaced so other Durable Objects can share this binding's name space later.
export function dailyBudgetName(now: Date): string {
  return `font-proxy-bytes:${now.toISOString().slice(0, 10)}`;
}

// The endpoint names in this header what it read upstream, DNS answers included; the gate
// charges that when it is more than the body it sent, and strips it before the client sees it.
export const UPSTREAM_BYTES_HEADER = 'x-font-proxy-upstream-bytes';

export interface Meter {
  bytes: number;
}

const PROXY_PATH = '/api/font-proxy';

// Astro's trailingSlash 'ignore' also routes '/api/font-proxy/', and other spellings may reach
// the endpoint too, so every path that starts like the proxy's pays: a false match costs one
// Durable Object read, a missed one relays for free.
export function isProxyPath(pathname: string): boolean {
  let path = pathname;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    // A malformed escape is judged as written.
  }
  return path.replace(/\/{2,}/g, '/').toLowerCase().startsWith(PROXY_PATH);
}

function unavailable(): Response {
  return new Response('The font proxy is unavailable', { status: 503 });
}

export async function withBudget(
  request: Request,
  budgets: Budgets | undefined,
  ctx: ExecutionContext,
  next: () => Promise<Response>,
  now = new Date(),
): Promise<Response> {
  if (!isProxyPath(new URL(request.url).pathname)) return next();

  // With no count to check, the proxy stays shut rather than relaying with no cap.
  if (!budgets) {
    console.error('font proxy: the FONT_PROXY_BUDGET binding is missing');
    return unavailable();
  }
  let budget: Budget;
  let spent: number;
  try {
    budget = budgets.getByName(dailyBudgetName(now));
    spent = await budget.spent();
  } catch (e) {
    console.error('font proxy: reading the budget failed', e);
    return unavailable();
  }
  if (spent >= DAILY_BYTES) {
    return new Response('The font proxy has spent its budget for today', { status: 503 });
  }
  const charge = (n: number) => budget.add(n).catch((e: unknown) => {
    console.error('font proxy: adding to the budget failed', e);
  });

  const response = await next();
  const upstreamBytes = Number(response.headers.get(UPSTREAM_BYTES_HEADER)) || 0;
  const headers = new Headers(response.headers);
  headers.delete(UPSTREAM_BYTES_HEADER);
  const init = { status: response.status, statusText: response.statusText, headers };
  if (!response.body) {
    ctx.waitUntil(charge(upstreamBytes));
    return new Response(null, init);
  }
  let bytes = 0;
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytes += chunk.byteLength;
      controller.enqueue(chunk);
    },
  });
  // A client that hangs up rejects the pipe; count what went out before that.
  ctx.waitUntil(response.body.pipeTo(counter.writable).catch(() => {}).then(() => charge(Math.max(bytes, upstreamBytes))));
  return new Response(counter.readable, init);
}
