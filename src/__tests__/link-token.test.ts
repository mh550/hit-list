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
  it.each([
    ['https://x.test/share/#t=tok', 'tok'],
    ['?t=tok', 'tok'],
    ['tok', 'tok'],
    ['  tok  ', 'tok'],
    ['https://x.test/share/?a=1&t=tok', 'tok'],
    ['https://x.test/share/?t=AbC-d_9', 'AbC-d_9'],
  ])('reads %p as %p', (text, token) => {
    expect(parseToken(text)).toBe(token);
  });

  it.each(['https://x.test/other', '', '   ', 'two words'])('returns null for %p', (text) => {
    expect(parseToken(text)).toBeNull();
  });
});
