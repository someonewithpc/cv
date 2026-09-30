import { expect, test } from '@playwright/test';

import { type Budget, DAILY_BYTES, dailyBudgetName, UPSTREAM_BYTES_HEADER, withBudget } from '../src/server/fontProxyBudget';

// Drives the Worker entry's budget gate in the test process, with an in-memory stand-in for
// the per-day Durable Objects and a scripted Astro handler.

const PROXY = 'https://cv.test/api/font-proxy?url=https%3A%2F%2Ffonts.test%2Fa.css';

function days(start: Record<string, number> = {}) {
  const bytes = new Map(Object.entries(start));
  const asked: string[] = [];
  return {
    bytes,
    asked,
    getByName(name: string): Budget {
      asked.push(name);
      return {
        spent: async () => bytes.get(name) ?? 0,
        add: async (n: number) => void bytes.set(name, (bytes.get(name) ?? 0) + n),
      };
    },
  };
}

function context() {
  const pending: Promise<unknown>[] = [];
  return { waitUntil: (p: Promise<unknown>) => void pending.push(p), settle: () => Promise.all(pending) };
}

function handler(size: number, chunk = 1024) {
  const calls = { count: 0 };
  const next = async () => {
    calls.count++;
    let left = size;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (left === 0) return controller.close();
        const n = Math.min(chunk, left);
        left -= n;
        controller.enqueue(new Uint8Array(n));
      },
    }, { highWaterMark: 0 });
    return new Response(body, { status: 200, headers: { 'content-type': 'text/css' } });
  };
  return { calls, next };
}

const NOON = new Date('2026-09-25T12:00:00Z');
const TODAY = dailyBudgetName(NOON);
const TOMORROW = dailyBudgetName(new Date('2026-09-26T00:00:00Z'));

test.describe('font proxy daily budget', () => {
  test('relays the body unchanged and adds its bytes to the day it was served', async () => {
    const budgets = days({ [TODAY]: 500 });
    const ctx = context();
    const { next } = handler(5000);
    const response = await withBudget(new Request(PROXY), budgets, ctx, next, NOON);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/css');
    expect((await response.arrayBuffer()).byteLength).toBe(5000);
    await ctx.settle();
    expect(budgets.bytes.get(TODAY)).toBe(5500);
  });

  test('answers 503 once the day has relayed 1 GB, never calling the proxy', async () => {
    expect(DAILY_BYTES).toBe(1024 ** 3);
    const budgets = days({ [TODAY]: DAILY_BYTES });
    const ctx = context();
    const { calls, next } = handler(100);
    const response = await withBudget(new Request(PROXY), budgets, ctx, next, NOON);
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe(String(12 * 60 * 60));
    expect(calls.count).toBe(0);
    await ctx.settle();
    expect(budgets.bytes.get(TODAY)).toBe(DAILY_BYTES);
    const late = await withBudget(new Request(PROXY), budgets, context(), next, new Date('2026-09-25T23:59:59.500Z'));
    expect(late.headers.get('retry-after')).toBe('1');
  });

  test('still serves one byte under the budget', async () => {
    const budgets = days({ [TODAY]: DAILY_BYTES - 1 });
    const { calls, next } = handler(100);
    const response = await withBudget(new Request(PROXY), budgets, context(), next, NOON);
    expect(response.status).toBe(200);
    expect(calls.count).toBe(1);
  });

  test('opens a fresh count at UTC midnight', async () => {
    const budgets = days({ [TODAY]: DAILY_BYTES });
    const ctx = context();
    const { next } = handler(100);
    const response = await withBudget(new Request(PROXY), budgets, ctx, next, new Date('2026-09-26T00:00:00Z'));
    expect(response.status).toBe(200);
    await response.arrayBuffer();
    await ctx.settle();
    expect(budgets.asked).toEqual([TOMORROW]);
    expect(budgets.bytes.get(TOMORROW)).toBe(100);
  });

  test('counts what went out before a client hangs up', async () => {
    const budgets = days();
    const ctx = context();
    const { next } = handler(10 * 1024);
    const response = await withBudget(new Request(PROXY), budgets, ctx, next, NOON);
    const reader = response.body!.getReader();
    const first = await reader.read();
    await reader.cancel();
    await ctx.settle();
    const counted = budgets.bytes.get(TODAY)!;
    expect(counted).toBeGreaterThanOrEqual(first.value!.byteLength);
    expect(counted).toBeLessThan(10 * 1024);
  });

  test('leaves other paths alone', async () => {
    const budgets = days({ [TODAY]: DAILY_BYTES });
    const { calls, next } = handler(10);
    const page = await withBudget(new Request('https://cv.test/font-picker'), budgets, context(), next, NOON);
    expect(page.status).toBe(200);
    expect(budgets.asked).toEqual([]);
    expect(calls.count).toBe(1);
  });

  test('answers 503 without the binding, or when the budget cannot be read, never calling the proxy', async () => {
    const { calls, next } = handler(10);
    const unbound = await withBudget(new Request(PROXY), undefined, context(), next, NOON);
    expect(unbound.status).toBe(503);
    const broken = {
      getByName: () => ({
        spent: () => Promise.reject(new Error('object reset')),
        add: () => Promise.resolve(),
      }),
    };
    const failed = await withBudget(new Request(PROXY), broken, context(), next, NOON);
    expect(failed.status).toBe(503);
    const throwing = { getByName: (): Budget => { throw new Error('no such namespace'); } };
    expect((await withBudget(new Request(PROXY), throwing, context(), next, NOON)).status).toBe(503);
    expect(calls.count).toBe(0);
  });

  test('still serves the body when adding to the budget fails, and settles the wait', async () => {
    const ctx = context();
    const { next } = handler(100);
    const failing = { getByName: () => ({ spent: async () => 0, add: () => Promise.reject(new Error('object reset')) }) };
    const response = await withBudget(new Request(PROXY), failing, ctx, next, NOON);
    expect((await response.arrayBuffer()).byteLength).toBe(100);
    await ctx.settle();
  });
});

test.describe('font proxy budget path', () => {
  test('budgets every spelling of the proxy path Astro routes to the endpoint', async () => {
    for (const path of ['/api/font-proxy/', '/api/font-proxy//', '//api/font-proxy', '/api//font-proxy', '/api/font%2Dproxy', '/API/Font-Proxy']) {
      const budgets = days({ [TODAY]: DAILY_BYTES });
      const { calls, next } = handler(10);
      const response = await withBudget(new Request(`https://cv.test${path}?url=x`), budgets, context(), next, NOON);
      expect(response.status, path).toBe(503);
      expect(calls.count, path).toBe(0);
    }
  });
});

test.describe('font proxy upstream bytes', () => {
  test('charges what the endpoint read upstream when it sent less, and hides the header', async () => {
    const budgets = days();
    const ctx = context();
    const next = async () => new Response('Response too large', {
      status: 413,
      headers: { [UPSTREAM_BYTES_HEADER]: String(8 * 1024 * 1024 + 1) },
    });
    const response = await withBudget(new Request(PROXY), budgets, ctx, next, NOON);
    expect(response.status).toBe(413);
    expect(response.headers.get(UPSTREAM_BYTES_HEADER)).toBeNull();
    expect(await response.text()).toBe('Response too large');
    await ctx.settle();
    expect(budgets.bytes.get(TODAY)).toBe(8 * 1024 * 1024 + 1);
  });

  test('charges the body once when it is what came from upstream', async () => {
    const budgets = days();
    const ctx = context();
    const next = async () => new Response(new Uint8Array(5000), { headers: { [UPSTREAM_BYTES_HEADER]: '5300' } });
    const response = await withBudget(new Request(PROXY), budgets, ctx, next, NOON);
    expect((await response.arrayBuffer()).byteLength).toBe(5000);
    await ctx.settle();
    expect(budgets.bytes.get(TODAY)).toBe(5300);
  });
});
