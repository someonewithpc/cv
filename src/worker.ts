import { handle } from '@astrojs/cloudflare/handler';
import { DurableObject } from 'cloudflare:workers';

// What the font proxy may relay in one UTC day before it answers 503 until midnight.
const DAILY_BYTES = 1024 ** 3;

// One object per UTC day, named by the date, holding that day's byte count.
export class FontProxyBudget extends DurableObject {
  async spent(): Promise<number> {
    return (await this.ctx.storage.get<number>('bytes')) ?? 0;
  }

  async add(bytes: number): Promise<void> {
    await this.ctx.storage.put('bytes', (await this.spent()) + bytes);
  }
}

interface WorkerEnv {
  FONT_PROXY_BUDGET?: DurableObjectNamespace<FontProxyBudget>;
}

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    if (!env.FONT_PROXY_BUDGET || new URL(request.url).pathname !== '/api/font-proxy') {
      return handle(request, env, ctx);
    }

    const budget = env.FONT_PROXY_BUDGET.getByName(new Date().toISOString().slice(0, 10));
    if (await budget.spent() >= DAILY_BYTES) {
      return new Response('The font proxy has spent its budget for today', { status: 503 });
    }

    const response = await handle(request, env, ctx);
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
  },
};
