import { createHash } from 'node:crypto';
import { getRandomBytes } from 'expo-crypto';

import { linkUrl, newToken, parseToken, tokenHash, TOKEN_RE } from '@/src/utils/link-token';

describe('newToken', () => {
  it('is 22 chars of base64url and differs between calls', () => {
    const a = newToken();
    const b = newToken();

    expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(a).toMatch(TOKEN_RE);
    expect(b).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(a).not.toBe(b);
  });

  it('is 16 random bytes from expo-crypto as base64url without padding', () => {
    const bytes = new Uint8Array([0xfb, 0xff, 0xbf, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff]);
    jest.mocked(getRandomBytes).mockReturnValueOnce(bytes);

    expect(newToken()).toBe(Buffer.from(bytes).toString('base64url'));
    expect(getRandomBytes).toHaveBeenLastCalledWith(16);
  });
});

describe('tokenHash', () => {
  it("is the SHA-256 of the token in lowercase hex, as Node's", async () => {
    await expect(tokenHash('abc')).resolves.toBe(createHash('sha256').update('abc').digest('hex'));
    await expect(tokenHash('abc')).resolves.toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('linkUrl', () => {
  it('puts the token in the fragment', () => {
    expect(linkUrl('https://x.test/share/', 'tok')).toBe('https://x.test/share/#t=tok');
  });
});

describe('parseToken', () => {
  const T = 'AbC-d_9AbC-d_9AbC-d_9x'; // 22 chars, like newToken()

  it.each([
    [`https://x.test/share/#t=${T}`, T],
    [`?t=${T}`, T],
    [T, T],
    [`  ${T}  `, T],
    [`https://x.test/share/?a=1&t=${T}`, T],
    [`https://x.test/share/?t=${T}`, T],
  ])('reads %p as %p', (text, token) => {
    expect(parseToken(text)).toBe(token);
  });

  // S9-07 review B#3: a single word ('rail') is not a token; it would reach redeem_invite and the preview's log
  it.each([
    'https://x.test/other',
    '',
    '   ',
    'two words',
    'rail',
    'downtown',
    'https://x.test/share/#t=tok',
    `${T}x`,
    `https://x.test/share/#t=${T}x`,
  ])('returns null for %p', (text) => {
    expect(parseToken(text)).toBeNull();
  });
});
