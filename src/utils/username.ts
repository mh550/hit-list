// @username rules (D39), the same as the server's profiles_username_format check and its citext unique index:
// 3–20 characters of a–z 0–9 _ ., compared case-insensitively, so the app stores them lowercased.

const BAD_CHARACTER = /[^a-z0-9_.]/;
const MIN_LENGTH = 3;
const MAX_LENGTH = 20;

/** The username as it is stored: trimmed and lowercased. */
export function normalizeUsername(text: string): string {
  return text.trim().toLowerCase();
}

/** Why the (normalized) text is not a username, or null when it is one. The first failing rule wins. */
export function validateUsername(text: string): string | null {
  const name = normalizeUsername(text);
  if (!name) return 'Pick a username';
  if (BAD_CHARACTER.test(name)) return 'Only letters, numbers, _ and .';
  if (name.length < MIN_LENGTH) return `At least ${MIN_LENGTH} characters`;
  if (name.length > MAX_LENGTH) return `At most ${MAX_LENGTH} characters`;
  return null;
}
