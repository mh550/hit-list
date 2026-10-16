import { randomUUID } from 'expo-crypto';

/**
 * A new v4 UUID for a spot or media row. Native (expo-crypto), because Hermes has no
 * `crypto.getRandomValues`, so the `uuid` package throws on the phone.
 */
export function newId(): string {
  return randomUUID();
}
