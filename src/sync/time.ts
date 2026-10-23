/**
 * One timestamp shape across the server boundary (docs/plans/2026-10-22-s5-sync.md, Global constraints): the server
 * answers `2026-10-23T01:02:03.456789+00:00`, the app writes `2026-10-23T01:02:03.456Z`, SQLite's datetime() wrote
 * `2026-10-23 01:02:03` (UTC). Parsed by hand: Hermes' Date.parse rejects some of these.
 */
const TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

/**
 * `YYYY-MM-DDTHH:MM:SS.sssZ` (UTC, milliseconds), or null when the value is not a readable timestamp. A value without
 * a zone is UTC (SQLite's datetime()), or with `zoneless = 'local'` the phone's wall clock (an EXIF capture time,
 * src/utils/exif.ts).
 */
export function toIso(value: string | null | undefined, zoneless: 'utc' | 'local' = 'utc'): string | null {
  const m = value ? TIMESTAMP.exec(value.trim()) : null;
  if (!m) return null;
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map((part) => Number(part ?? 0));
  const ms = Number((m[7] ?? '').padEnd(3, '0').slice(0, 3));
  const local = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const check = new Date(local);
  // Date.UTC rolls February 30 over into March: a value that does not come back unchanged was not a date
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    check.getUTCHours() !== hour ||
    check.getUTCMinutes() !== minute ||
    check.getUTCSeconds() !== second
  ) {
    return null;
  }
  if (m[8] === undefined && zoneless === 'local') return new Date(wallClockToUtc(local)).toISOString();
  return new Date(local - offsetMinutes(m[8]) * 60_000).toISOString();
}

/** A wall-clock time (given as if it were UTC) in the phone's zone; the offset is read again at the result for DST. */
function wallClockToUtc(wallClock: number): number {
  const guess = wallClock + new Date(wallClock).getTimezoneOffset() * 60_000;
  return wallClock + new Date(guess).getTimezoneOffset() * 60_000;
}

/** `Z`, none (UTC), `+02`, `+02:00` or `-0700` in minutes east of UTC. */
function offsetMinutes(zone: string | undefined): number {
  if (!zone || zone.toUpperCase() === 'Z') return 0;
  const sign = zone[0] === '-' ? -1 : 1;
  const digits = zone.slice(1).replace(':', '');
  return sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2) || 0));
}
