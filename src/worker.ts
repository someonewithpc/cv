import { handle } from '@astrojs/cloudflare/handler';
import { DurableObject } from 'cloudflare:workers';

import { addBytes, spentBytes, withBudget } from './server/fontProxyBudget';
import { canonicalRequest } from './server/requestPath';

// One object per UTC day, named 'font-proxy-bytes:<date>', holding that day's byte count until
// its alarm deletes it.
export class FontProxyBudget extends DurableObject {
  async spent(): Promise<number> {
    return spentBytes(this.ctx.storage);
  }

  async add(bytes: number): Promise<void> {
    await addBytes(this.ctx.storage, bytes, new Date());
  }

  async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}

interface WorkerEnv {
  FONT_PROXY_BUDGET: DurableObjectNamespace<FontProxyBudget>;
}

export default {
  fetch(raw: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    const request = canonicalRequest(raw);
    return withBudget(request, env.FONT_PROXY_BUDGET, ctx, () => handle(request, env, ctx));
  },
};
