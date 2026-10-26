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

// Where the request came from, as Cloudflare reads it off the address. Only these four:
// no postcode or coordinates are ever stored.
export interface Place {
  country: string;
  city: string;
  region: string;
  timezone: string;
}

export const NOWHERE: Place = { country: '', city: '', region: '', timezone: '' };

// The browser's family on a visit, read off the User-Agent header here in the worker so a
// script cannot pick its own. Only the family is kept, never the string or a version.
export const BROWSER_FAMILIES = ['bot', 'edge', 'opera', 'samsung', 'firefox', 'chrome', 'safari', 'other', 'none'] as const;
export type BrowserFamily = (typeof BROWSER_FAMILIES)[number];

const BOT_AGENT = /googlebot|bingbot|linkedinbot|facebookexternalhit|twitterbot|slackbot|discordbot|whatsapp|telegrambot|curl|python-requests|go-http-client|headlesschrome|bot|crawler|spider|fetch|preview/i;

// Ordered: Edge, Opera and Samsung Internet also name Chrome and Safari, and Chrome names Safari.
const FAMILY_AGENTS: [BrowserFamily, RegExp][] = [
  ['edge', /\bEdg(e|A|iOS)?\//],
  ['opera', /\bOPR\/|\bOpera\b/],
  ['samsung', /\bSamsungBrowser\//],
  ['firefox', /\b(Firefox|FxiOS)\//],
  ['chrome', /\b(Chrome|CriOS|Chromium)\//],
  ['safari', /\bSafari\//],
];

export function browserFamily(userAgent: string | null): BrowserFamily {
  if (!userAgent?.trim()) return 'none';
  if (BOT_AGENT.test(userAgent)) return 'bot';
  return FAMILY_AGENTS.find(([, pattern]) => pattern.test(userAgent))?.[0] ?? 'other';
}

// What a visit says about the client beyond its place: the browser family, the network's
// operator as Cloudflare names it ("Amazon.com", "MEO") and Cloudflare's category for a
// verified bot. A datacentre operator is the plainest sign of a script.
export interface Agent {
  browser: string;
  network: string;
  botCategory: string;
}

export const NO_AGENT: Agent = { browser: '', network: '', botCategory: '' };

type RequestAgent = { asOrganization?: unknown, verifiedBotCategory?: unknown };

export function agentOf(request: Request): Agent {
  const cf = (request as { cf?: RequestAgent }).cf ?? {};
  const read = (value: unknown) => (typeof value === 'string' ? value.slice(0, MAX_EXTRA_LENGTH) : '');
  return {
    browser: browserFamily(request.headers.get('user-agent')),
    network: read(cf.asOrganization),
    botCategory: read(cf.verifiedBotCategory),
  };
}

// Blob positions: 1 visitor, 2 session, 3 country, 4 to 6 the event's string extras,
// 7 city, 8 region, 9 time zone, and on visits only 10 the browser family, 11 the network
// and 12 the verified bot category. Doubles: 1 the count, 2 the event's number. Padded so a
// query can name a position. 7 onwards came after the rest so older rows keep their meaning.
export const BLOB_COUNT = 12;
const EXTRA_BLOBS = 3;

export function dataPoint(event: Event, visitor: string, session: string, place: Place, agent: Agent = NO_AGENT): DataPoint {
  const strings = event.extras.filter((extra): extra is string => typeof extra === 'string');
  const number = event.extras.find((extra): extra is number => typeof extra === 'number') ?? 0;
  const extras = strings.slice(0, EXTRA_BLOBS);
  while (extras.length < EXTRA_BLOBS) extras.push('');
  const { browser, network, botCategory } = event.name === 'visit' ? agent : NO_AGENT;
  const blobs = [visitor, session, place.country, ...extras, place.city, place.region, place.timezone, browser, network, botCategory];
  return { indexes: [event.name], blobs, doubles: [1, number] };
}

type RequestPlace = Partial<Record<keyof Place, unknown>>;

export function placeOf(request: Request): Place {
  const cf = (request as { cf?: RequestPlace }).cf ?? {};
  const read = (value: unknown) => (typeof value === 'string' ? value : '');
  return { country: read(cf.country), city: read(cf.city), region: read(cf.region), timezone: read(cf.timezone) };
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
    const userAgent = request.headers.get('user-agent');
    const visitor = await visitorId(await sink.salt(), request.headers.get('cf-connecting-ip'), userAgent);
    const place = placeOf(request);
    const agent = agentOf(request);
    for (const event of payload.events) {
      sink.dataset.writeDataPoint(dataPoint(event, visitor, payload.session, place, agent));
    }
  } catch (e) {
    console.error('analytics: dropping a batch', e);
  }
  return empty(204);
}
