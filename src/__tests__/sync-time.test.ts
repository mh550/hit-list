import { toIso } from '@/src/sync/time';

describe('toIso: one timestamp shape across the server boundary', () => {
  it.each([
    ['the app’s own ISO form', '2026-10-23T01:02:03.456Z', '2026-10-23T01:02:03.456Z'],
    ['Postgres +00:00 with microseconds', '2026-10-23T01:02:03.456789+00:00', '2026-10-23T01:02:03.456Z'],
    ['no fraction', '2026-10-23T01:02:03+00:00', '2026-10-23T01:02:03.000Z'],
    ['one fraction digit', '2026-10-23T01:02:03.4Z', '2026-10-23T01:02:03.400Z'],
    ['an offset other than UTC', '2026-10-23T03:02:03.000+02:00', '2026-10-23T01:02:03.000Z'],
    ['a negative offset without a colon', '2026-10-22T18:02:03-0700', '2026-10-23T01:02:03.000Z'],
    ['SQLite datetime(), read as UTC', '2026-10-23 01:02:03', '2026-10-23T01:02:03.000Z'],
    ['a space and +00', '2026-10-23 01:02:03.5+00', '2026-10-23T01:02:03.500Z'],
  ])('reads %s', (_label, input, expected) => {
    expect(toIso(input)).toBe(expected);
  });

  it.each([
    ['EXIF colons', '2026:10:13 14:22:00'],
    ['a date only', '2026-10-23'],
    ['month 13', '2026-13-01T00:00:00Z'],
    ['February 30', '2026-02-30T00:00:00Z'],
    ['hour 24', '2026-10-23T24:00:00Z'],
    ['words', 'yesterday'],
    ['empty', ''],
  ])('answers null for %s', (_label, input) => {
    expect(toIso(input)).toBeNull();
  });

  it('answers null for null and undefined', () => {
    expect(toIso(null)).toBeNull();
    expect(toIso(undefined)).toBeNull();
  });
});
