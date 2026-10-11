import { EVENT_PATH, EVENTS, type EventName, MAX_BODY_BYTES, MAX_EVENTS, MAX_EXTRA_LENGTH, SESSION_PATTERN } from '../analytics';
import { canonicalPath } from './requestPath';

export type Extra = string | number;

export interface Event {
  name: EventName;
  extras: Extra[];
}

export interface Payload {
  session: string;
  events: Event[];
}

export function isEventPath(pathname: string): boolean {
  const path = canonicalPath(pathname);
  return path === EVENT_PATH || path === `${EVENT_PATH}/`;
}

// Global Privacy Control, or the older Do Not Track
export function optedOut(headers: { get(name: string): string | null }): boolean {
  return headers.get('sec-gpc') === '1' || headers.get('dnt') === '1';
}

function parseEvent(raw: unknown): Event | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const [name, ...extras] = raw as unknown[];
  if (typeof name !== 'string' || !Object.hasOwn(EVENTS, name)) return null;
  const shape = EVENTS[name as EventName];
  if (extras.length > shape.length) return null;
  for (const [i, extra] of extras.entries()) {
    if (shape[i] === 'string') {
      if (typeof extra !== 'string' || extra.length > MAX_EXTRA_LENGTH) return null;
    } else if (typeof extra !== 'number' || !Number.isFinite(extra)) {
      return null;
    }
  }
  return { name: name as EventName, extras: extras as Extra[] };
}

// `{ s: session, e: [[name, ...extras], ...] }`, or null for anything else. Checked whole:
// one bad event drops the batch, since a client that sends one is not the page's own.
export function parsePayload(body: string): Payload | null {
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const { s, e } = raw as { s?: unknown, e?: unknown };
  if (typeof s !== 'string' || !SESSION_PATTERN.test(s)) return null;
  if (!Array.isArray(e) || e.length === 0 || e.length > MAX_EVENTS) return null;
  const events: Event[] = [];
  for (const item of e) {
    const event = parseEvent(item);
    if (!event) return null;
    events.push(event);
  }
  return { session: s, events };
}

// One salt per calendar month, in the budget objects' namespaced style
export function saltName(now: Date): string {
  return `analytics-salt:${now.toISOString().slice(0, 7)}`;
}

// The object deletes itself a day after its month ends, leaving room for the last beacons
// of the month to settle. After that nobody can recompute that month's ids.
export function saltAlarmTime(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 2);
}

export interface SaltStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: string): Promise<void>;
  getAlarm(): Promise<number | null>;
  setAlarm(scheduledTime: number): Promise<void>;
}

const SALT_KEY = 'salt';
export const SALT_BYTES = 32;

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// The salt is made on the object's first read and never leaves its storage except as the
// value the worker hashes with.
export async function readSalt(storage: SaltStorage, now: Date): Promise<string> {
  let salt = await storage.get<string>(SALT_KEY);
  if (!salt) {
    salt = hex(crypto.getRandomValues(new Uint8Array(SALT_BYTES)));
    await storage.put(SALT_KEY, salt);
  }
  if (await storage.getAlarm() === null) {
    await storage.setAlarm(saltAlarmTime(now));
  }
  return salt;
}

export const VISITOR_ID_LENGTH = 16;

// Without a proxied zone (wrangler dev, the preview worker) there is no client address and
// the id is the user agent's alone.
export async function visitorId(salt: string, ip: string | null, userAgent: string | null): Promise<string> {
  const data = new TextEncoder().encode(salt + (ip ?? '') + (userAgent ?? ''));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return hex(new Uint8Array(digest)).slice(0, VISITOR_ID_LENGTH);
}

export interface DataPoint {
  indexes: [string];
  blobs: string[];
  doubles: number[];
}

// Blob positions: 1 visitor, 2 session, 3 country, 4 to 6 the event's string extras.
// Doubles: 1 the count, 2 the event's number. Padded so a query can name a position.
export const BLOB_COUNT = 6;
const EXTRA_BLOBS = BLOB_COUNT - 3;

export function dataPoint(event: Event, visitor: string, session: string, country: string): DataPoint {
  const strings = event.extras.filter((extra): extra is string => typeof extra === 'string');
  const number = event.extras.find((extra): extra is number => typeof extra === 'number') ?? 0;
  const blobs = [visitor, session, country, ...strings.slice(0, EXTRA_BLOBS)];
  while (blobs.length < BLOB_COUNT) blobs.push('');
  return { indexes: [event.name], blobs, doubles: [1, number] };
}

export interface Dataset {
  writeDataPoint(point: DataPoint): void;
}

export interface EventSink {
  // The month's salt, cached by the caller
  salt(): Promise<string>;
  dataset: Dataset | undefined;
}

function empty(status: number, headers?: Record<string, string>): Response {
  return new Response(null, { status, headers });
}

// Answers 204 whatever happens: an opt-out, a bad body or a failure all look the same to
// the page, which has nothing to do with the answer. Only the method is reported.
export async function handleEvents(request: Request, sink: EventSink): Promise<Response> {
  if (request.method !== 'POST') return empty(405, { allow: 'POST' });
  try {
    if (optedOut(request.headers)) return empty(204);
    if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) return empty(204);
    const payload = parsePayload(await request.text());
    if (!payload || !sink.dataset) return empty(204);
    const visitor = await visitorId(
      await sink.salt(),
      request.headers.get('cf-connecting-ip'),
      request.headers.get('user-agent'),
    );
    const country = (request as { cf?: { country?: string } }).cf?.country ?? '';
    for (const event of payload.events) {
      sink.dataset.writeDataPoint(dataPoint(event, visitor, payload.session, country));
    }
  } catch (e) {
    console.error('analytics: dropping a batch', e);
  }
  return empty(204);
}
