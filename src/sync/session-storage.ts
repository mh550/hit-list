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

async function removeItem(key: string): Promise<void> {
  await Promise.all([SecureStore.deleteItemAsync(key, SECURE_OPTIONS), AsyncStorage.removeItem(key)]);
}

async function setItem(key: string, value: string): Promise<void> {
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

// A missing ciphertext (after a reinstall the keychain survives, AsyncStorage does not) or one that
// fails to decrypt reads as signed out: both entries are dropped and null comes back, never a throw.
async function getItem(key: string): Promise<string | null> {
  const stored = await SecureStore.getItemAsync(key, SECURE_OPTIONS);
  if (stored === null) return null;
  if (!stored.startsWith(KEY_PREFIX)) return stored;
  try {
    const combined = await AsyncStorage.getItem(key);
    if (combined === null) throw new Error('session ciphertext missing');
    const aesKey = await AESEncryptionKey.import(stored.slice(KEY_PREFIX.length), 'base64');
    const plain = await aesDecryptAsync(AESSealedData.fromCombined(combined), aesKey);
    return new TextDecoder().decode(plain);
  } catch {
    await removeItem(key);
    return null;
  }
}

export const sessionStorage = { getItem, setItem, removeItem };
