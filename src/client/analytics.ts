/**
 * What the page reports to /api/e, and how. The vocabulary is src/analytics.ts, shared with
 * the worker, which drops anything outside it. A session id made here on load groups the
 * events of one visit; it lives in this module and nowhere else, so closing the tab ends it.
 * Nothing is written to a cookie or to storage, and the worker turns the visitor into a
 * hash whose salt is forgotten at the end of the month.
 *
 * Events wait up to two seconds and go together in one beacon, so a burst of section
 * reports costs one request. A tab going hidden or being torn down sends what is queued at
 * once, with sendBeacon so the request outlives the page.
 */
import { EVENT_PATH, EVENTS, type EventName, MAX_EVENTS, MAX_EXTRA_LENGTH } from '@/analytics';
import { SITE_URL } from '@/site';

type ExtraOf<Kind> = Kind extends 'string' ? string : number;
// Mapped through a type parameter so only the tuple's slots are mapped, not Array's methods
type ExtrasOfShape<Shape extends readonly ('string' | 'number')[]> = { -readonly [Index in keyof Shape]: ExtraOf<Shape[Index]> };
type ExtrasOf<Name extends EventName> = ExtrasOfShape<(typeof EVENTS)[Name]>;
type Extra = string | number;
type Queued = [EventName, ...Extra[]];

const BATCH_MS = 2000;

const SESSION_BYTES = 8;

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const session = hex(crypto.getRandomValues(new Uint8Array(SESSION_BYTES)));

/** Global Privacy Control, or the older Do Not Track: nothing is queued and nothing is sent. */
function optedOut(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return !!nav.globalPrivacyControl || nav.doNotTrack === '1';
}

/**
 * Production only: a preview or a dev server must not write to the production dataset, and
 * the preview worker has no dataset anyway. `?analytics=1` lifts the guard so the e2e spec,
 * and a reviewer with the network tab open, can watch the beacons on a preview. It is not
 * a review switch to strip at landing: it is the only way the hooks get exercised in a test.
 */
function onProductionHost(): boolean {
  return location.hostname === new URL(SITE_URL).hostname
    || new URLSearchParams(location.search).get('analytics') === '1';
}

const enabled = !optedOut() && onProductionHost();

let queue: Queued[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;

function send(events: Queued[]): void {
  const body = JSON.stringify({ s: session, e: events });
  if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(EVENT_PATH, body)) return;
  fetch(EVENT_PATH, { method: 'POST', body, keepalive: true }).catch(() => {});
}

/** Sends everything queued now, in beacons of at most MAX_EVENTS each. */
export function flush(): void {
  clearTimeout(timer);
  timer = undefined;
  while (queue.length > 0) send(queue.splice(0, MAX_EVENTS));
}

/**
 * Queues one event. Extras are checked against the vocabulary here too, since the worker
 * drops a whole batch over one bad event: a string is cut to the length the worker takes
 * and an event with a missing or malformed extra is dropped on its own.
 */
export function track<Name extends EventName>(name: Name, ...extras: ExtrasOf<Name>): void {
  if (!enabled) return;
  const shape = EVENTS[name];
  const given = extras as readonly unknown[];
  if (given.length !== shape.length) return;
  const checked: Extra[] = [];
  for (const [i, kind] of shape.entries()) {
    const extra = given[i];
    if (kind === 'string') {
      if (typeof extra !== 'string') return;
      checked.push(extra.slice(0, MAX_EXTRA_LENGTH));
    } else {
      if (typeof extra !== 'number' || !Number.isFinite(extra)) return;
      checked.push(extra);
    }
  }
  queue.push([name, ...checked]);
  timer ??= setTimeout(flush, BATCH_MS);
}

let started = false;

/** Called once from Layout.astro's module script. */
export function startAnalytics(): void {
  if (started || !enabled) return;
  started = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);
}
