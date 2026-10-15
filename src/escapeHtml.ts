const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** For element text. The highlighter checks its output against the source with only these three undone. */
export const escapeHtml = (text: string | number): string => String(text).replace(/[&<>]/g, (char) => ENTITIES[char]);

/** For element text or a quoted attribute value. */
export const escapeAttribute = (text: string | number): string => String(text).replace(/[&<>"']/g, (char) => ENTITIES[char]);
