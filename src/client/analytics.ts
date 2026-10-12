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

/**
 * Sends only on hsal.es, and never when the browser sends Global Privacy Control or Do Not
 * Track, or is driven by WebDriver, Playwright, Puppeteer or safaridriver
 * (`navigator.webdriver`). Nothing overrides this; the e2e specs map hsal.es to the test
 * server and report `navigator.webdriver` as false.
 */
function computeEnabled(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return location.hostname === new URL(SITE_URL).hostname
    && !nav.globalPrivacyControl
    && nav.doNotTrack !== '1'
    && !navigator.webdriver;
}

const enabled = computeEnabled();

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

// The hooks. Each reads what the page already carries (ids, data attributes, the stacks'
// own paper-flip event) rather than asking the components to call in.

const NARROW_REM = 48;
const WIDE_REM = 80;

function viewportBucket(): string {
  const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const rem = innerWidth / rootFontSize;
  return rem < NARROW_REM ? 'narrow' : rem < WIDE_REM ? 'medium' : 'wide';
}

function referrerHost(): string {
  try {
    return document.referrer ? new URL(document.referrer).hostname : '';
  } catch {
    return '';
  }
}

/** The picked theme, or which OS scheme the page follows when nothing is picked. */
function themeInEffect(): string {
  return document.documentElement.dataset.theme
    ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'os-dark' : 'os-light');
}

/** A demo's name: the callout's data-demo (Callout.astro), reached from anything inside it. */
function demoOf(el: Element | null): string | undefined {
  return el?.closest<HTMLElement>('[data-demo]')?.dataset.demo;
}

/**
 * The top-level sections of main and each demo's callout, each reported the first time it
 * comes into view. A section counts once its top has passed the lower third of the window,
 * so the next one peeking in at the bottom while the reader is still on this one does not
 * count, and a section taller than the window (Career on a phone) still does.
 */
function watchSections(): void {
  const seen = new Set<string>();
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const el = entry.target as HTMLElement;
      const id = el.dataset.demo ?? el.id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      track('section', id);
      observer.unobserve(el);
    }
  }, { rootMargin: '0px 0px -33% 0px' });
  for (const el of document.querySelectorAll('main > [id], [data-demo]')) observer.observe(el);
}

/** The sheet drawn on top: the wrapper foldDrag.ts numbers 1 (see frontPage.ts). */
function frontSheetId(stack: Element): string {
  for (const wrapper of stack.children as HTMLCollectionOf<HTMLElement>) {
    if (wrapper.style.getPropertyValue('--page-index').trim() !== '1') continue;
    return wrapper.querySelector<HTMLElement>('[data-sheet-id]')?.dataset.sheetId ?? '';
  }
  return '';
}

/**
 * One flip event per change of front sheet. paper-flip is dispatched on the stack without
 * bubbling, so the document hears it in the capture phase; it also fires once as each stack
 * boots, which the seeded map tells from a turn.
 */
function watchFlips(): void {
  const fronts = new Map<Element, string>();
  for (const stack of document.querySelectorAll('[data-paper-stack-root]')) fronts.set(stack, frontSheetId(stack));
  document.addEventListener('paper-flip', (event) => {
    const stack = event.target;
    if (!(stack instanceof Element)) return;
    const sheet = frontSheetId(stack);
    if (sheet === fronts.get(stack)) return;
    fronts.set(stack, sheet);
    const demo = demoOf(stack);
    if (demo) track('flip', demo, sheet);
  }, true);
}

/** The first pointer or key inside a demo's stack, once per demo. */
function watchDemoUse(): void {
  const used = new Set<string>();
  const onUse = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const demo = demoOf(target.closest('[data-paper-stack-root]'));
    if (!demo || used.has(demo)) return;
    used.add(demo);
    track('demo', demo);
  };
  document.addEventListener('pointerdown', onUse, true);
  document.addEventListener('keydown', onUse, true);
}

function watchThemePicks(): void {
  document.addEventListener('change', (event) => {
    const input = event.target;
    if (input instanceof HTMLInputElement && input.closest('#theme-picker')) track('theme', input.value);
  });
}

/** A click on a contact link in the title block (Name.astro's data-contact). */
function watchContactClicks(): void {
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const kind = target.closest('a')?.closest<HTMLElement>('[data-contact]')?.dataset.contact;
    if (kind) track('contact', kind);
  });
}

const LEAVE_EVERY_MS = 60_000;

/** Seconds since load each time the tab goes hidden, at most once a minute. */
function watchLeaves(): void {
  let lastLeave = -LEAVE_EVERY_MS;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    const now = performance.now();
    if (now - lastLeave < LEAVE_EVERY_MS) return;
    lastLeave = now;
    track('leave', Math.round(now / 1000));
  });
}

let started = false;

/** Called once from Layout.astro's module script. */
export function startAnalytics(): void {
  if (started || !enabled) return;
  started = true;
  track('visit', referrerHost(), viewportBucket(), themeInEffect());
  watchSections();
  watchFlips();
  watchDemoUse();
  watchThemePicks();
  watchContactClicks();
  window.addEventListener('beforeprint', () => track('print'));
  watchLeaves();
  // After the leave hook, so the leave goes in the same beacon.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);
}
