/**
 * What the event bus sheets draw, in one place: the event, the modules that listen for it
 * in the order ModuleManager discovers them, and what each handler returns for each
 * attachment. The layers render from it on the server and the bus script replays it in the
 * browser, so the chain on every page answers the same way.
 *
 * Names are GNU social v3's own. The handlers' decisions are the encoders' shouldHandle()
 * checks: ImageEncoder takes any image, VideoEncoder takes video and image/gif, and Embed
 * only claims the thumbnails it stored for a link preview.
 */

export type EventResult = 'next' | 'stop' | 'unhandled';

/** The three things the attachment block can end up holding. */
export type Rendered = 'image' | 'video' | 'link';

export type Attachment = {
  id: string;
  filename: string;
  mimetype: string;
};

export type Listener = {
  /** The module's class, which is also its directory under plugins/. */
  module: string;
  kind: 'component' | 'plugin';
  method: string;
  priority: number;
  /** What the handler returns for each attachment, by id. */
  returns: Record<string, EventResult>;
  /** What a handler that stops puts in $res, by attachment id. */
  renders?: Record<string, Rendered>;
};

export const EVENT = 'ViewAttachmentImage';

export const attachments: Attachment[] = [
  { id: 'jpeg', filename: 'harbour.jpg', mimetype: 'image/jpeg' },
  { id: 'gif', filename: 'loop.gif', mimetype: 'image/gif' },
];

export const defaultAttachment = 'jpeg';

/**
 * All three at the dispatcher's default priority, so the order is ModuleManager's: its
 * glob lists the plugin directories alphabetically, and that is the order the listeners
 * are added in.
 */
export const listeners: Listener[] = [
  {
    module: 'Embed',
    kind: 'plugin',
    method: `on${EVENT}`,
    priority: 0,
    returns: { jpeg: 'unhandled', gif: 'unhandled' },
  },
  {
    module: 'ImageEncoder',
    kind: 'plugin',
    method: `on${EVENT}`,
    priority: 0,
    returns: { jpeg: 'stop', gif: 'stop' },
    renders: { jpeg: 'image', gif: 'image' },
  },
  {
    module: 'VideoEncoder',
    kind: 'plugin',
    method: `on${EVENT}`,
    priority: 0,
    returns: { jpeg: 'unhandled', gif: 'stop' },
    renders: { gif: 'video' },
  },
];

export type Outcome = {
  /** Per listener, in chain order: what it returned, or null when it never heard the event. */
  results: (EventResult | null)[];
  /** What Event::handle hands back to the emitter. */
  result: EventResult;
  /** The module that claimed the event, if one did. */
  claimedBy: string | null;
  /** What ended up in $res. */
  rendered: Rendered;
};

/**
 * One dispatch, the way Symfony's dispatcher walks it: listeners in order until one stops
 * propagation. Disabled modules are not loaded, so they are not in the chain at all.
 */
export function dispatch(attachmentId: string, enabled: (module: string) => boolean = () => true): Outcome {
  const attachment = attachments.find((entry) => entry.id === attachmentId) ?? attachments[0];
  const results: (EventResult | null)[] = [];
  let claimedBy: string | null = null;
  let rendered: Rendered = 'link';
  let anyNext = false;

  for (const listener of listeners) {
    if (!enabled(listener.module) || claimedBy) {
      results.push(null);
      continue;
    }
    const result = listener.returns[attachment.id] ?? 'unhandled';
    results.push(result);
    if (result === 'next') anyNext = true;
    if (result === 'stop') {
      claimedBy = listener.module;
      rendered = listener.renders?.[attachment.id] ?? 'link';
    }
  }

  const result: EventResult = claimedBy ? 'stop' : anyNext ? 'next' : 'unhandled';
  // Nobody stopped, so the emitter's own branch runs and core renders a plain link.
  return { results, result, claimedBy, rendered };
}
