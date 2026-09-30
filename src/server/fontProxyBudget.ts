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

export async function withBudget(
  request: Request,
  budgets: Budgets | undefined,
  ctx: ExecutionContext,
  next: () => Promise<Response>,
  now = new Date(),
): Promise<Response> {
  if (!budgets || !isProxyPath(new URL(request.url).pathname)) return next();

  const budget = budgets.getByName(dailyBudgetName(now));
  if (await budget.spent() >= DAILY_BYTES) {
    return new Response('The font proxy has spent its budget for today', { status: 503 });
  }

  const response = await next();
  if (!response.body) return response;
  let bytes = 0;
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytes += chunk.byteLength;
      controller.enqueue(chunk);
    },
  });
  // A client that hangs up rejects the pipe; count what went out before that.
  ctx.waitUntil(response.body.pipeTo(counter.writable).catch(() => {}).then(() => budget.add(bytes)));
  return new Response(counter.readable, response);
}
