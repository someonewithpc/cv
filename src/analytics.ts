// What the page may report to /api/e, shared by the client module and the worker so the
// worker drops any name it does not know. Each event names the extras it carries, in order:
// strings go to the data point's blobs, the one number to its doubles. Ids are the stable
// ones the page already carries (section ids, demo slugs, sheet ids), never positions.
export const EVENTS = {
  // referrer host, viewport bucket (narrow, medium, wide), theme in effect
  visit: ['string', 'string', 'string'],
  // section id
  section: ['string'],
  // demo id, sheet id
  flip: ['string', 'string'],
  // demo id
  demo: ['string'],
  // theme name
  theme: ['string'],
  print: [],
  // link kind: email, or a profile's label in lower case (github, codeberg, linkedin)
  contact: ['string'],
  // seconds since load
  leave: ['number'],
} as const satisfies Record<string, readonly ('string' | 'number')[]>;

export type EventName = keyof typeof EVENTS;

export const EVENT_PATH = '/api/e';

export const MAX_EVENTS = 20;
export const MAX_EXTRA_LENGTH = 64;
export const MAX_BODY_BYTES = 4096;
export const SESSION_PATTERN = /^[0-9a-f]{16}$/;
