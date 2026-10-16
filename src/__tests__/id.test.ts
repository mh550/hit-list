import { randomUUID } from 'expo-crypto';
import { newId } from '@/src/utils/id';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newId', () => {
  it('returns a v4 UUID, different each call', () => {
    const a = newId();
    const b = newId();

    expect(a).toMatch(UUID_V4);
    expect(b).toMatch(UUID_V4);
    expect(a).not.toBe(b);
  });

  it('comes from expo-crypto, not the uuid package', () => {
    // The uuid package reads `globalThis.crypto.getRandomValues`, which Hermes on the phone does not have
    // ("crypto.getRandomValues() not supported" on the import review screen). expo-crypto is a native module.
    expect(jest.isMockFunction(randomUUID)).toBe(true);
    jest.mocked(randomUUID).mockReturnValueOnce('11111111-2222-4333-8444-555555555555');

    expect(newId()).toBe('11111111-2222-4333-8444-555555555555');
  });

  it('works without a global crypto, as on Hermes', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      expect(newId()).toMatch(UUID_V4);
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor);
    }
  });
});
