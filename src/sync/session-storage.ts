import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AESEncryptionKey, AESSealedData, aesDecryptAsync, aesEncryptAsync } from 'expo-crypto';

// The auth-js session store (D61, Supabase's LargeSecureStore pattern on expo-crypto's AES-GCM).
// A session of at most 2048 UTF-8 bytes (SecureStore's limit) lives in the keychain as is. A larger one
// is encrypted into AsyncStorage under the same key, with a fresh 256-bit key in the keychain.
// Signing out goes through removeItem, so the key leaves with the session.

const SECURE_STORE_LIMIT = 2048;
const KEY_PREFIX = 'aes256gcm:';
// Readable after the first unlock, so a background token refresh can read it.
const SECURE_OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

async function deleteItem(key: string): Promise<void> {
  await Promise.all([SecureStore.deleteItemAsync(key, SECURE_OPTIONS), AsyncStorage.removeItem(key)]);
}

async function writeItem(key: string, value: string): Promise<void> {
  const bytes = new TextEncoder().encode(value);
  if (bytes.length <= SECURE_STORE_LIMIT) {
    await SecureStore.setItemAsync(key, value, SECURE_OPTIONS);
    await AsyncStorage.removeItem(key);
    return;
  }
  const aesKey = await AESEncryptionKey.generate();
  const sealed = await aesEncryptAsync(bytes, aesKey);
  await AsyncStorage.setItem(key, await sealed.combined('base64'));
  await SecureStore.setItemAsync(key, KEY_PREFIX + (await aesKey.encoded('base64')), SECURE_OPTIONS);
}

// Every operation on a key waits for the one before it: overlapping large writes could otherwise leave one
// write's key next to the other's ciphertext, and a read between a write's two steps would see the same,
// both of which read as signed out.
const queues = new Map<string, Promise<unknown>>();
function queued<T>(key: string, op: () => Promise<T>): Promise<T> {
  const next = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(op);
  queues.set(key, next);
  return next;
}

// A missing ciphertext (after a reinstall the keychain survives, AsyncStorage does not) or one that
// fails to decrypt reads as signed out: both entries are dropped. A store that fails to read only
// reads as no session this time. getItem never throws.
async function readItem(key: string): Promise<string | null> {
  let stored: string | null;
  let combined: string | null = null;
  try {
    stored = await SecureStore.getItemAsync(key, SECURE_OPTIONS);
    if (stored === null || !stored.startsWith(KEY_PREFIX)) return stored;
    combined = await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
  try {
    if (combined === null) throw new Error('session ciphertext missing');
    const aesKey = await AESEncryptionKey.import(stored.slice(KEY_PREFIX.length), 'base64');
    const plain = await aesDecryptAsync(AESSealedData.fromCombined(combined), aesKey);
    return new TextDecoder().decode(plain);
  } catch {
    await deleteItem(key).catch(() => {});
    return null;
  }
}

export const sessionStorage = {
  getItem: (key: string) => queued(key, () => readItem(key)),
  setItem: (key: string, value: string) => queued(key, () => writeItem(key, value)),
  removeItem: (key: string) => queued(key, () => deleteItem(key)),
};
