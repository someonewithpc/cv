// What the font proxy may relay in one UTC day before it answers 503 until midnight.
export const DAILY_BYTES = 1024 ** 3;

export interface Budget {
  spent(): Promise<number>;
  add(bytes: number): Promise<void>;
}

export interface Budgets {
  getByName(name: string): Budget;
}

export async function withBudget(
  request: Request,
  budgets: Budgets | undefined,
  ctx: ExecutionContext,
  next: () => Promise<Response>,
  now = new Date(),
): Promise<Response> {
  if (!budgets || new URL(request.url).pathname !== '/api/font-proxy') return next();

  const budget = budgets.getByName(now.toISOString().slice(0, 10));
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
