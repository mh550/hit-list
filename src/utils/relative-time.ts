const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * How long ago `iso` was, in Profile's words: 'just now' (under a minute, or a little in the future from another
 * clock), '3 min ago', '5 hr ago', '2 days ago'. `null` when `iso` is unreadable.
 */
export function relativeTime(iso: string, now: number = Date.now()): string | null {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const elapsed = now - then;
  if (elapsed < MINUTE) return 'just now';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} hr ago`;
  const days = Math.floor(elapsed / DAY);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}
