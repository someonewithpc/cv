import { expect, test } from '@playwright/test';

import { EVENTS, MAX_EVENTS } from '../src/analytics';
import { BLOB_COUNT, type DataPoint, dataPoint, handleEvents, isEventPath, NOWHERE, optedOut, parsePayload, readSalt, saltAlarmTime, saltName, type SaltStorage, visitorId } from '../src/server/analytics';
import { canonicalRequest } from '../src/server/requestPath';

// Drives the event route's pure parts in the test process, with a scripted dataset and salt.

const SESSION = '0123456789abcdef';
const SALT_A = 'a'.repeat(64);
const SALT_B = 'b'.repeat(64);
const ROUTE = 'https://cv.test/api/e';

function payload(events: unknown[], session = SESSION): string {
  return JSON.stringify({ s: session, e: events });
}

function post(body: string, headers: Record<string, string> = {}): Request {
  return new Request(ROUTE, { method: 'POST', body, headers: { 'user-agent': 'test', ...headers } });
}

function sink(salt = SALT_A) {
  const points: DataPoint[] = [];
  let asked = 0;
  return {
    points,
    asked: () => asked,
    salt: async () => { asked++; return salt; },
    dataset: { writeDataPoint: (point: DataPoint) => void points.push(point) },
  };
}

test.describe('analytics payload', () => {
  test('accepts a valid batch', () => {
    const parsed = parsePayload(payload([['visit', 'example.org', 'wide', 'light'], ['print'], ['leave', 42.5]]));
    expect(parsed).toEqual({
      session: SESSION,
      events: [
        { name: 'visit', extras: ['example.org', 'wide', 'light'] },
        { name: 'print', extras: [] },
        { name: 'leave', extras: [42.5] },
      ],
    });
  });

  test('rejects 21 events, and takes 20', () => {
    const twenty = Array.from({ length: MAX_EVENTS }, () => ['print']);
    expect(parsePayload(payload(twenty))?.events).toHaveLength(20);
    expect(parsePayload(payload([...twenty, ['print']]))).toBeNull();
  });

  test('rejects an unknown name, even beside known ones', () => {
    expect(parsePayload(payload([['click']]))).toBeNull();
    expect(parsePayload(payload([['visit', 'a', 'b', 'c'], ['toString']]))).toBeNull();
    expect(parsePayload(payload([['visit', 'a', 'b', 'c'], ['scroll', 1]]))).toBeNull();
  });

  test('rejects extras of the wrong shape', () => {
    expect(parsePayload(payload([['section', 'x'.repeat(64)]]))).not.toBeNull();
    expect(parsePayload(payload([['section', 'x'.repeat(65)]]))).toBeNull();
    expect(parsePayload(payload([['section', 1]]))).toBeNull();
    expect(parsePayload(payload([['section', 'a', 'b']]))).toBeNull();
    expect(parsePayload(payload([['leave', '42']]))).toBeNull();
    expect(parsePayload(payload([['leave', 1e400]]))).toBeNull();
    expect(parsePayload(payload([['print', null]]))).toBeNull();
    expect(parsePayload(payload([[]]))).toBeNull();
    expect(parsePayload(payload(['print']))).toBeNull();
  });

  test('rejects a bad session, an empty batch, an oversized or malformed body', () => {
    expect(parsePayload(payload([['print']], 'ABCDEF0123456789'))).toBeNull();
    expect(parsePayload(payload([['print']], '0123456789abcde'))).toBeNull();
    expect(parsePayload(payload([]))).toBeNull();
    expect(parsePayload('{"s":"' + SESSION + '","e":[["print"]],"pad":"' + 'x'.repeat(4096) + '"}')).toBeNull();
    expect(parsePayload('{')).toBeNull();
    expect(parsePayload('null')).toBeNull();
    expect(parsePayload('[]')).toBeNull();
  });
});

test.describe('analytics opt-out', () => {
  test('Sec-GPC or DNT opts out, anything else does not', () => {
    expect(optedOut(new Headers({ 'sec-gpc': '1' }))).toBe(true);
    expect(optedOut(new Headers({ dnt: '1' }))).toBe(true);
    expect(optedOut(new Headers({ 'sec-gpc': '0', dnt: '0' }))).toBe(false);
    expect(optedOut(new Headers())).toBe(false);
  });

  test('the handler answers 204 and writes nothing on a GPC header', async () => {
    const s = sink();
    const response = await handleEvents(post(payload([['print']]), { 'sec-gpc': '1' }), s);
    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
    expect(s.points).toEqual([]);
    expect(s.asked()).toBe(0);
  });
});

test.describe('analytics visitor id', () => {
  test('is 16 hex characters, the same for one salt and different across salts', async () => {
    const one = await visitorId(SALT_A, '203.0.113.7', 'Mozilla/5.0');
    expect(one).toMatch(/^[0-9a-f]{16}$/);
    expect(await visitorId(SALT_A, '203.0.113.7', 'Mozilla/5.0')).toBe(one);
    expect(await visitorId(SALT_B, '203.0.113.7', 'Mozilla/5.0')).not.toBe(one);
    expect(await visitorId(SALT_A, '203.0.113.8', 'Mozilla/5.0')).not.toBe(one);
    expect(await visitorId(SALT_A, null, 'Mozilla/5.0')).toBe(await visitorId(SALT_A, '', 'Mozilla/5.0'));
  });
});

const LISBON = { country: 'PT', city: 'Lisbon', region: 'Lisbon', timezone: 'Europe/Lisbon' };

test.describe('analytics data point', () => {
  test('always carries nine blobs and two doubles, extras in stable positions', () => {
    for (const name of Object.keys(EVENTS) as (keyof typeof EVENTS)[]) {
      const point = dataPoint({ name, extras: [] }, 'v', SESSION, LISBON);
      expect(point.blobs, name).toHaveLength(BLOB_COUNT);
      expect(point.indexes, name).toEqual([name]);
      expect(point.doubles, name).toEqual([1, 0]);
    }
    expect(dataPoint({ name: 'flip', extras: ['marker-editor', 'store'] }, 'v', SESSION, LISBON)).toEqual({
      indexes: ['flip'],
      blobs: ['v', SESSION, 'PT', 'marker-editor', 'store', '', 'Lisbon', 'Lisbon', 'Europe/Lisbon'],
      doubles: [1, 0],
    });
    expect(dataPoint({ name: 'leave', extras: [91] }, 'v', SESSION, NOWHERE)).toEqual({
      indexes: ['leave'],
      blobs: ['v', SESSION, '', '', '', '', '', '', ''],
      doubles: [1, 91],
    });
  });
});

test.describe('analytics route', () => {
  test('writes one point per event with the visitor, session and place', async () => {
    const s = sink();
    const request = post(payload([['visit', 'example.org', 'wide', 'dark'], ['leave', 3]]), { 'cf-connecting-ip': '203.0.113.7' });
    Object.assign(request, { cf: { country: 'PT', city: 'Lisbon', region: 'Lisbon', timezone: 'Europe/Lisbon', postalCode: '1000-001', latitude: '38.7', asn: 3243 } });
    const response = await handleEvents(request, s);
    expect(response.status).toBe(204);
    expect(response.headers.get('set-cookie')).toBeNull();
    const visitor = await visitorId(SALT_A, '203.0.113.7', 'test');
    expect(s.points).toEqual([
      { indexes: ['visit'], blobs: [visitor, SESSION, 'PT', 'example.org', 'wide', 'dark', 'Lisbon', 'Lisbon', 'Europe/Lisbon'], doubles: [1, 0] },
      { indexes: ['leave'], blobs: [visitor, SESSION, 'PT', '', '', '', 'Lisbon', 'Lisbon', 'Europe/Lisbon'], doubles: [1, 3] },
    ]);
  });

  test('answers 204 and writes nothing on a bad body, a missing dataset or a failing salt', async () => {
    const bad = sink();
    expect((await handleEvents(post('not json'), bad)).status).toBe(204);
    expect((await handleEvents(post(payload([['nope']])), bad)).status).toBe(204);
    expect(bad.points).toEqual([]);
    const unbound = { ...sink(), dataset: undefined };
    expect((await handleEvents(post(payload([['print']])), unbound)).status).toBe(204);
    const failing = { ...sink(), salt: () => Promise.reject(new Error('object reset')) };
    expect((await handleEvents(post(payload([['print']])), failing)).status).toBe(204);
    const throwing = { ...sink(), dataset: { writeDataPoint: () => { throw new Error('quota'); } } };
    expect((await handleEvents(post(payload([['print']])), throwing)).status).toBe(204);
  });

  test('answers 405 to any other method', async () => {
    for (const method of ['GET', 'PUT', 'DELETE', 'HEAD']) {
      const response = await handleEvents(new Request(ROUTE, { method }), sink());
      expect(response.status, method).toBe(405);
      expect(response.headers.get('allow'), method).toBe('POST');
    }
  });

  test('matches every spelling of the path the worker canonicalises', () => {
    for (const path of ['/api/e', '/api/e/', '/API/E', '/api//e/']) {
      expect(isEventPath(path), path).toBe(true);
      expect(isEventPath(new URL(canonicalRequest(new Request(`https://cv.test${path}`)).url).pathname), path).toBe(true);
    }
    for (const path of ['/api/e.json', '/api/ev', '/api/font-proxy']) {
      expect(isEventPath(path), path).toBe(false);
    }
  });
});

test.describe('analytics salt object', () => {
  function storage() {
    const data = new Map<string, string>();
    let alarm: number | null = null;
    const store: SaltStorage = {
      get: async <T>(key: string) => data.get(key) as T | undefined,
      put: async (key, value) => void data.set(key, value),
      getAlarm: async () => alarm,
      setAlarm: async (time) => void (alarm = time),
    };
    return { store, data, alarm: () => alarm };
  }

  test('is named by the month and deleted a day after it ends', () => {
    expect(saltName(new Date('2026-10-11T12:00:00Z'))).toBe('analytics-salt:2026-10');
    expect(saltAlarmTime(new Date('2026-10-11T12:00:00Z'))).toBe(Date.parse('2026-11-02T00:00:00Z'));
    expect(saltAlarmTime(new Date('2026-12-31T23:59:59Z'))).toBe(Date.parse('2027-01-02T00:00:00Z'));
  });

  test('makes 32 random bytes once and books the alarm once', async () => {
    const { store, data, alarm } = storage();
    const first = await readSalt(store, new Date('2026-10-11T12:00:00Z'));
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(await readSalt(store, new Date('2026-10-20T12:00:00Z'))).toBe(first);
    expect(alarm()).toBe(Date.parse('2026-11-02T00:00:00Z'));
    expect(data.size).toBe(1);
    expect(await readSalt(storage().store, new Date())).not.toBe(first);
  });
});
