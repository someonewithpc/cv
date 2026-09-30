import { handle } from '@astrojs/cloudflare/handler';
import { DurableObject } from 'cloudflare:workers';

import { withBudget } from './server/fontProxyBudget';

// One object per UTC day, named 'font-proxy-bytes:<date>', holding that day's byte count.
export class FontProxyBudget extends DurableObject {
  async spent(): Promise<number> {
    return (await this.ctx.storage.get<number>('fontProxyBytes')) ?? 0;
  }

  async add(bytes: number): Promise<void> {
    await this.ctx.storage.put('fontProxyBytes', (await this.spent()) + bytes);
  }
}

interface WorkerEnv {
  FONT_PROXY_BUDGET: DurableObjectNamespace<FontProxyBudget>;
}

export default {
  fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    return withBudget(request, env.FONT_PROXY_BUDGET, ctx, () => handle(request, env, ctx));
  },
};
