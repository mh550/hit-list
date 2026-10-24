import { relativeTime } from '@/src/utils/relative-time';

const NOW = Date.parse('2026-10-23T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;

describe('relativeTime', () => {
  it.each([
    [0, 'just now'],
    [59_999, 'just now'],
    [MIN, '1 min ago'],
    [3 * MIN + 30_000, '3 min ago'],
    [59 * MIN, '59 min ago'],
    [60 * MIN, '1 hr ago'],
    [5 * 60 * MIN + 59 * MIN, '5 hr ago'],
    [24 * 60 * MIN, '1 day ago'],
    [3 * 24 * 60 * MIN, '3 days ago'],
  ])('%i ms ago reads %s', (ms, expected) => {
    expect(relativeTime(ago(ms), NOW)).toBe(expected);
  });

  it('a time a little in the future (another clock) reads just now', () => {
    expect(relativeTime(ago(-30_000), NOW)).toBe('just now');
  });

  it('defaults now to the current time', () => {
    expect(relativeTime(new Date().toISOString())).toBe('just now');
  });

  it('an unreadable time reads as nothing', () => {
    expect(relativeTime('not a time', NOW)).toBeNull();
  });
});
