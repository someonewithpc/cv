/**
 * What the event bus sheets draw, in one place: the event, the modules that listen for it
 * in the order ModuleManager discovers them, and what each handler returns for each
 * attachment. The layers render from it on the server and the bus script replays it in the
 * browser, so the chain on every page answers the same way.
 *
 * Names and answers are GNU social v3's own. ViewAttachment is raised by
 * templates/cards/blocks/attachment.html.twig, and each encoder's onViewAttachment keeps
 * to its own mimetype major: AudioEncoder takes audio/*, ImageEncoder image/* and
 * VideoEncoder video/*. Anything else gets Event::next. The enum has an unhandled case,
 * but no handler in the tree returns it.
 */

export type EventResult = 'next' | 'stop' | 'unhandled';

/** What the attachment block can end up holding: a plugin's view, or the template's link. */
export type Rendered = 'image' | 'video' | 'audio' | 'link';

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
  /** What a handler that stops appends to $res, by attachment id. */
  renders?: Record<string, Rendered>;
};

export const EVENT = 'ViewAttachment';

export const attachments: Attachment[] = [
  { id: 'jpeg', filename: 'harbour.jpg', mimetype: 'image/jpeg' },
  { id: 'mp4', filename: 'clip.mp4', mimetype: 'video/mp4' },
  { id: 'ogg', filename: 'voice.ogg', mimetype: 'audio/ogg' },
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
    module: 'AudioEncoder',
    kind: 'plugin',
    method: `on${EVENT}`,
    priority: 0,
    returns: { jpeg: 'next', mp4: 'next', ogg: 'stop', gif: 'next' },
    renders: { ogg: 'audio' },
  },
  {
    module: 'ImageEncoder',
    kind: 'plugin',
    method: `on${EVENT}`,
    priority: 0,
    returns: { jpeg: 'stop', mp4: 'next', ogg: 'next', gif: 'stop' },
    renders: { jpeg: 'image', gif: 'image' },
  },
  {
    module: 'VideoEncoder',
    kind: 'plugin',
    method: `on${EVENT}`,
    priority: 0,
    returns: { jpeg: 'next', mp4: 'stop', ogg: 'next', gif: 'next' },
    renders: { mp4: 'video' },
  },
];

export type Outcome = {
  /** Per listener, in chain order: what it returned, or null when it never heard the event. */
  results: (EventResult | null)[];
  /** What Event::handle hands back to the emitter: the last answer given. */
  result: EventResult;
  /** The module that claimed the event, if one did. */
  claimedBy: string | null;
  /** What ended up in $res. */
  rendered: Rendered;
};

/**
 * One dispatch, the way Symfony's dispatcher walks it: listeners in order until one stops
 * propagation. Disabled modules are not loaded, so they are not in the chain at all.
 * GSEvent::getResult() is the last result set, or next when no listener ran.
 */
export function dispatch(attachmentId: string, enabled: (module: string) => boolean = () => true): Outcome {
  const attachment = attachments.find((entry) => entry.id === attachmentId) ?? attachments[0];
  const results: (EventResult | null)[] = [];
  let claimedBy: string | null = null;
  let rendered: Rendered = 'link';
  let result: EventResult = 'next';

  for (const listener of listeners) {
    if (!enabled(listener.module) || claimedBy) {
      results.push(null);
      continue;
    }
    result = listener.returns[attachment.id] ?? 'next';
    results.push(result);
    if (result === 'stop') {
      claimedBy = listener.module;
      rendered = listener.renders?.[attachment.id] ?? 'link';
    }
  }

  // Nobody appended a block, so the template's own branch renders a plain link.
  return { results, result, claimedBy, rendered };
}

/**
 * Where the GIF's thumbnail comes from. AttachmentThumbnail::getOrCreate raises
 * FileResizerAvailable, and each encoder that can resize the file adds a resizer to
 * $event_map and answers next: ImageEncoder under the major, image, and VideoEncoder under
 * image/gif itself, to keep a GIF moving. ModuleManager.php:202 adds every module handler
 * at priority 0, so the dispatcher does not choose between them. The core does:
 * array_merge puts the exact mimetype's list ahead of the major's ("Always prefer specific
 * encoders", AttachmentThumbnail.php:231), and the first resizer to return true wins.
 */
export type Resizer = {
  module: string;
  method: string;
  /** The $event_map key the module files its resizer under. */
  key: string;
};

export const resizers: Resizer[] = [
  { module: 'VideoEncoder', method: 'resizeVideoPath', key: 'image/gif' },
  { module: 'ImageEncoder', method: 'resizeImagePath', key: 'image' },
];

/** Per resizer, in merged order: 'true' when it made the thumbnail, 'unused' when the loop
    broke before it, 'off' when its module is not loaded and never added it. */
export type ResizeResult = 'true' | 'unused' | 'off';

export function resize(enabled: (module: string) => boolean = () => true) {
  let by: string | null = null;
  const results: ResizeResult[] = resizers.map(({ module }) => {
    if (!enabled(module)) return 'off';
    if (by) return 'unused';
    by = module;
    return 'true';
  });
  return { results, by: by as string | null };
}
