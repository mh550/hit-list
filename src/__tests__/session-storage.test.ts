// The session store (D61): SecureStore holds a small session; a large one is AES-GCM encrypted into
// AsyncStorage with a fresh key in SecureStore. Both stores are mocked in jest.setup.ts with the members
// of node_modules/expo-secure-store/build/SecureStore.d.ts (getItemAsync, setItemAsync, deleteItemAsync)
// and the package's own @react-native-async-storage/async-storage/jest/async-storage-mock.
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { sessionStorage } from '@/src/sync/session-storage';

const KEY = 'sb-127-auth-token';
const secure = (SecureStore as unknown as { __store: Map<string, string> }).__store;

beforeEach(async () => {
  secure.clear();
  await AsyncStorage.clear();
});

describe('sessionStorage', () => {
  it('stores a 100-byte value in SecureStore only', async () => {
    const value = 'a'.repeat(100);

    await sessionStorage.setItem(KEY, value);

    expect(secure.get(KEY)).toBe(value);
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
    expect(await sessionStorage.getItem(KEY)).toBe(value);
  });

  it('encrypts a 5000-byte value into AsyncStorage with a random key in SecureStore', async () => {
    const value = JSON.stringify({ access_token: 'x'.repeat(4980) });

    await sessionStorage.setItem(KEY, value);

    expect(secure.get(KEY)).toMatch(/^aes256gcm:/);
    expect(secure.get(KEY)).not.toContain('xxxx');
    const stored = await AsyncStorage.getItem(KEY);
    expect(stored).not.toBeNull();
    expect(stored).not.toBe(value);
    expect(stored).not.toContain('access_token');
    expect(await sessionStorage.getItem(KEY)).toBe(value);
  });

  it('uses a fresh key on every large write', async () => {
    const value = 'b'.repeat(5000);

    await sessionStorage.setItem(KEY, value);
    const first = secure.get(KEY);
    await sessionStorage.setItem(KEY, value);

    expect(secure.get(KEY)).not.toBe(first);
    expect(await sessionStorage.getItem(KEY)).toBe(value);
  });

  it('drops the ciphertext when a large value is replaced by a small one', async () => {
    await sessionStorage.setItem(KEY, 'c'.repeat(5000));
    await sessionStorage.setItem(KEY, 'small');

    expect(await AsyncStorage.getItem(KEY)).toBeNull();
    expect(await sessionStorage.getItem(KEY)).toBe('small');
  });

  it('removeItem clears both stores', async () => {
    await sessionStorage.setItem(KEY, 'd'.repeat(5000));

    await sessionStorage.removeItem(KEY);

    expect(secure.has(KEY)).toBe(false);
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
    expect(await sessionStorage.getItem(KEY)).toBeNull();
  });

  it('returns null for a missing key', async () => {
    expect(await sessionStorage.getItem('nothing-here')).toBeNull();
  });

  it('reads a key with no ciphertext (after a reinstall) as signed out and clears it', async () => {
    await sessionStorage.setItem(KEY, 'e'.repeat(5000));
    // The iOS keychain outlives the app; AsyncStorage does not.
    await AsyncStorage.removeItem(KEY);

    expect(await sessionStorage.getItem(KEY)).toBeNull();
    expect(secure.has(KEY)).toBe(false);
  });

  it('reads tampered ciphertext as signed out without throwing', async () => {
    await sessionStorage.setItem(KEY, 'f'.repeat(5000));
    const stored = (await AsyncStorage.getItem(KEY)) as string;
    const bytes = Buffer.from(stored, 'base64');
    bytes[20] ^= 0xff;
    await AsyncStorage.setItem(KEY, bytes.toString('base64'));

    await expect(sessionStorage.getItem(KEY)).resolves.toBeNull();
    expect(secure.has(KEY)).toBe(false);
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  });

  it('counts UTF-8 bytes, not characters: 1500 multibyte characters (é, an emoji) are encrypted', async () => {
    const value = 'é'.repeat(1499) + '😀';
    expect(value.length).toBeLessThan(2048);

    await sessionStorage.setItem(KEY, value);

    expect(secure.get(KEY)).toMatch(/^aes256gcm:/);
    expect(await sessionStorage.getItem(KEY)).toBe(value);
  });

  it('keeps a value of exactly 2048 bytes in SecureStore', async () => {
    const value = 'g'.repeat(2048);

    await sessionStorage.setItem(KEY, value);

    expect(secure.get(KEY)).toBe(value);
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  });

  it('writes SecureStore entries readable after first unlock (background refresh)', async () => {
    await sessionStorage.setItem(KEY, 'h');

    expect(SecureStore.setItemAsync).toHaveBeenLastCalledWith(KEY, 'h', {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });

    await sessionStorage.setItem(KEY, 'h'.repeat(5000));

    expect(SecureStore.setItemAsync).toHaveBeenLastCalledWith(KEY, expect.stringMatching(/^aes256gcm:/), {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
  });

  it('ends with a readable session when two large writes overlap', async () => {
    const first = 'i'.repeat(5000);
    const second = 'j'.repeat(5000);
    // The first write's ciphertext lands late, after the second write has finished.
    const realSetItem = jest.mocked(AsyncStorage.setItem).getMockImplementation()!;
    jest.mocked(AsyncStorage.setItem).mockImplementationOnce(async (key, value) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return realSetItem(key, value);
    });

    await Promise.all([sessionStorage.setItem(KEY, first), sessionStorage.setItem(KEY, second)]);

    expect(await sessionStorage.getItem(KEY)).toBe(second);
  });

  it('a read during a large write waits for it instead of wiping the session', async () => {
    await sessionStorage.setItem(KEY, 'l'.repeat(5000));
    const next = 'm'.repeat(5000);

    const write = sessionStorage.setItem(KEY, next);
    const read = sessionStorage.getItem(KEY);
    await write;

    expect(await read).toBe(next);
    expect(await sessionStorage.getItem(KEY)).toBe(next);
  });

  it('keeps the session when AsyncStorage fails to read for a moment', async () => {
    const value = 'k'.repeat(5000);
    await sessionStorage.setItem(KEY, value);
    jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error('disk busy'));

    expect(await sessionStorage.getItem(KEY)).toBeNull();

    expect(await sessionStorage.getItem(KEY)).toBe(value);
  });

  it('never throws when the keychain read fails', async () => {
    jest.mocked(SecureStore.getItemAsync).mockRejectedValueOnce(new Error('keychain locked'));

    await expect(sessionStorage.getItem(KEY)).resolves.toBeNull();
  });
});
