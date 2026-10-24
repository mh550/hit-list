// @username rules (D39): 3–20 characters of a–z 0–9 _ ., compared case-insensitively. The server enforces the same
// (profiles_username_format + citext unique); these give the rider the reason before they press Done.
import { normalizeUsername, validateUsername } from '@/src/utils/username';

describe('normalizeUsername', () => {
  it('trims and lowercases', () => {
    expect(normalizeUsername('  Ana.B_1 ')).toBe('ana.b_1');
  });
});

describe('validateUsername', () => {
  it.each(['ana', 'a_b.c', 'a'.repeat(20), 'Ana', ' ana ', 'rider_1.a'])('accepts %p', (name) => {
    expect(validateUsername(name)).toBeNull();
  });

  it.each([
    ['', 'Pick a username'],
    ['   ', 'Pick a username'],
    ['ab', 'At least 3 characters'],
    ['a'.repeat(21), 'At most 20 characters'],
    ['an-a', 'Only letters, numbers, _ and .'],
    ['ana b', 'Only letters, numbers, _ and .'],
    ['@ana', 'Only letters, numbers, _ and .'],
    ['añá', 'Only letters, numbers, _ and .'],
  ])('rejects %p with %p', (name, message) => {
    expect(validateUsername(name)).toBe(message);
  });

  it('reports a bad character before the length', () => {
    expect(validateUsername('a-')).toBe('Only letters, numbers, _ and .');
  });
});
