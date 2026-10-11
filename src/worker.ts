import { handle } from '@astrojs/cloudflare/handler';
import { DurableObject } from 'cloudflare:workers';

import { type Dataset, handleEvents, isEventPath, readSalt, saltName } from './server/analytics';
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

// One object per calendar month, named 'analytics-salt:<month>', holding the 32 random bytes
// that month's visitor ids are hashed with until its alarm deletes it.
export class AnalyticsSalt extends DurableObject {
  async get(): Promise<string> {
    return readSalt(this.ctx.storage, new Date());
  }

  async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}

interface WorkerEnv {
  FONT_PROXY_BUDGET: DurableObjectNamespace<FontProxyBudget>;
  ANALYTICS_SALT: DurableObjectNamespace<AnalyticsSalt>;
  ANALYTICS?: Dataset;
}

// The month's salt is fetched from its object once per isolate, not once per beacon. A failed
// fetch is forgotten so the next beacon asks again.
let cachedSalt: { name: string, value: Promise<string> } | undefined;

function monthSalt(env: WorkerEnv): Promise<string> {
  const name = saltName(new Date());
  if (cachedSalt?.name !== name) {
    const value = env.ANALYTICS_SALT.getByName(name).get();
    cachedSalt = { name, value };
    value.catch(() => {
      if (cachedSalt?.value === value) cachedSalt = undefined;
    });
  }
  return cachedSalt.value;
}

export default {
  fetch(raw: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    const request = canonicalRequest(raw);
    if (isEventPath(new URL(request.url).pathname)) {
      return handleEvents(request, { salt: () => monthSalt(env), dataset: env.ANALYTICS });
    }
    return withBudget(request, env.FONT_PROXY_BUDGET, ctx, () => handle(request, env, ctx));
  },
};
