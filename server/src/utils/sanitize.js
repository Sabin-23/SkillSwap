/**
 * Remove control characters and trim free-text input.
 * Output escaping is handled by React on the client; this keeps stored
 * text tidy and strips characters that have no legitimate use in text fields.
 */
export function cleanText(value) {
  if (typeof value !== 'string') return value;
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
}

/** Escape LIKE/ILIKE wildcard characters so user input is matched literally. */
export function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, (char) => `\\${char}`);
}
