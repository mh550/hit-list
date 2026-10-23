import { CryptoDigestAlgorithm, CryptoEncoding, digestStringAsync, getRandomBytes } from 'expo-crypto';

/*
 * Link tokens (S9, docs/plans/2026-10-22-s9-links.md "Tokens", D45): 128 random bits as base64url. The server keeps
 * only the SHA-256 (lowercase hex); the URL carries the token in the fragment, so the page's host never sees it.
 * Parsed with regexes, not URL.searchParams (Hermes' URL lacks most of it).
 */

/** A token as newToken makes it: 16 bytes in base64url, no padding. */
export const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** base64url without padding (no btoa or Buffer on Hermes). */
function base64url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = Math.min(4, Math.ceil(((bytes.length - i) * 8) / 6));
    for (let c = 0; c < chars; c++) out += ALPHABET[(n >> (18 - 6 * c)) & 63];
  }
  return out;
}

/** A new link token: 16 random bytes from the native generator. */
export const newToken = (): string => base64url(getRandomBytes(16));

/** What the server stores for `token`: its SHA-256 in lowercase hex (redeem_invite hashes it the same way). */
export async function tokenHash(token: string): Promise<string> {
  const hex = await digestStringAsync(CryptoDigestAlgorithm.SHA256, token, { encoding: CryptoEncoding.HEX });
  return hex.toLowerCase();
}

/** The link for `token` under `base`, used verbatim (the default ends in '/'). */
export const linkUrl = (base: string, token: string): string => `${base}#t=${token}`;

/** The token in a pasted link (`…#t=`, `…?t=`, `…&t=`) or a bare token; null for anything else. */
export function parseToken(text: string): string | null {
  const trimmed = text.trim();
  if (/^[A-Za-z0-9_-]+$/.test(trimmed)) return trimmed;
  return /[#?&]t=([A-Za-z0-9_-]+)/.exec(trimmed)?.[1] ?? null;
}
