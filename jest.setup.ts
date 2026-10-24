import '@testing-library/react-native/matchers';

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}));

// expo-clipboard is native (build/Clipboard.d.ts: setStringAsync(text, options?) → Promise<boolean>); a test reads
// what was copied from the mock's calls.
jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(async (_text: string) => true),
  getStringAsync: jest.fn(async () => ''),
}));

// Mock expo-router
// useRouter / useLocalSearchParams are jest.fn so a test can override them with
// jest.mocked(useLocalSearchParams).mockReturnValue(...).
jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    dismissAll: jest.fn(),
  })),
  useLocalSearchParams: jest.fn(() => ({})),
  useIsFocused: jest.fn(() => true),
  usePathname: () => '/',
  Link: 'Link',
  Redirect: 'Redirect',
  Tabs: {
    Screen: 'Tabs.Screen',
  },
  Stack: {
    Screen: 'Stack.Screen',
  },
}));

// react-native-gesture-handler: the package's own setup swaps its native module for mocks, so
// GestureDetector renders and react-native-gesture-handler/jest-utils can fire gestures.
import 'react-native-gesture-handler/jestSetup';

// react-native-worklets (reanimated 4's runtime) loads its native module at import, which Jest
// does not have; its own mock stands in. Reanimated's mock below imports it.
jest.mock('react-native-worklets', () => jest.requireActual('react-native-worklets/src/mock'));

// Mock react-native-reanimated. Its mock's useSharedValue makes a new value on every render; the real one
// keeps the same value for the component's lifetime, so gestures that span re-renders see what they wrote.
jest.mock('react-native-reanimated', () => {
  const Reanimated = jest.requireActual('react-native-reanimated/mock');
  const { useState } = jest.requireActual('react');
  const makeSharedValue = Reanimated.useSharedValue;
  Reanimated.useSharedValue = (init: unknown) => useState(() => makeSharedValue(init))[0];
  Reanimated.default.call = () => {};
  return Reanimated;
});

// expo-sqlite: screens reach the DB through hooks that call useSQLiteContext, which throws outside a
// <SQLiteProvider>. Default to an empty db so a screen renders; any real query on it fails (and logs),
// so tests that save mock their actions or '@/src/db'. A test file's own jest.mock('expo-sqlite') wins.
// One db object for every call: a new one per render would change hook dependencies and loop effects.
jest.mock('expo-sqlite', () => {
  const mockDb = {};
  return { ...jest.requireActual('expo-sqlite'), useSQLiteContext: () => mockDb };
});

// expo-image renders as React Native's Image so tests can assert on `source`.
jest.mock('expo-image', () => ({ Image: jest.requireActual('react-native').Image }));

// SF Symbols are native-only; render a View whose testID names the symbol.
jest.mock('@/components/ui/icon-symbol', () => {
  const { createElement } = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return { IconSymbol: ({ name }: { name: string }) => createElement(View, { testID: `icon-${name}` }) };
});

// FlashList needs a measured layout. Render every row directly: tests assert row content, and a
// virtualized stand-in (FlatList) schedules cell updates on timers that fire outside act().
// A refreshControl element is rendered ahead of the rows, so a test can find it (UNSAFE_getByType(RefreshControl)).
type MockFlashListProps<T> = {
  data?: readonly T[] | null;
  renderItem: (info: { item: T; index: number }) => unknown;
  keyExtractor?: (item: T, index: number) => string;
  refreshControl?: unknown;
};
jest.mock('@shopify/flash-list', () => {
  const { Fragment, createElement } = jest.requireActual('react');
  return {
    FlashList: <T,>({ data, renderItem, keyExtractor, refreshControl }: MockFlashListProps<T>) =>
      createElement(
        Fragment,
        null,
        refreshControl ?? null,
        (data ?? []).map((item, index) =>
          createElement(Fragment, { key: keyExtractor ? keyExtractor(item, index) : index }, renderItem({ item, index })),
        ),
      ),
  };
});

// expo-location: members copied from node_modules/expo-location/build/Location.d.ts. Defaults are
// "permission denied, no position, no address"; tests override with jest.mocked(...).
const mockDeniedPermission = { status: 'denied', granted: false, canAskAgain: true, expires: 'never' };
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => mockDeniedPermission),
  getForegroundPermissionsAsync: jest.fn(async () => mockDeniedPermission),
  getLastKnownPositionAsync: jest.fn(async () => null),
  getCurrentPositionAsync: jest.fn(async () => {
    throw new Error('location unavailable in tests');
  }),
  reverseGeocodeAsync: jest.fn(async () => []),
  geocodeAsync: jest.fn(async () => []),
  Accuracy: { Lowest: 1, Low: 2, Balanced: 3, High: 4, Highest: 5, BestForNavigation: 6 },
}));


// expo-crypto is native; back it with Node's crypto (same names as expo-crypto/build/Crypto.d.ts).
jest.mock('expo-crypto', () => {
  const nodeCrypto = jest.requireActual<typeof import('node:crypto')>('node:crypto');
  return {
    randomUUID: jest.fn(() => nodeCrypto.randomUUID()),
    getRandomValues: jest.fn((array: Uint8Array<ArrayBuffer>) => nodeCrypto.getRandomValues(array)),
    getRandomBytes: jest.fn((byteCount: number) => new Uint8Array(nodeCrypto.randomBytes(byteCount))),
    // Crypto.types.d.ts: the digest of the UTF-8 string, hex (the default) or base64 per options.encoding.
    CryptoDigestAlgorithm: { SHA1: 'SHA-1', SHA256: 'SHA-256', SHA384: 'SHA-384', SHA512: 'SHA-512', MD5: 'MD5' },
    CryptoEncoding: { HEX: 'hex', BASE64: 'base64' },
    digestStringAsync: jest.fn(async (algorithm: string, data: string, options?: { encoding: 'hex' | 'base64' }) =>
      nodeCrypto
        .createHash(algorithm.replace('-', '').toLowerCase())
        .update(data, 'utf8')
        .digest(options?.encoding ?? 'hex'),
    ),
    // AES-GCM (expo-crypto/build/aes/index.d.ts, ExpoCryptoAES.d.ts): a string input is base64;
    // combined = iv (12) ‖ ciphertext ‖ tag (16), the native default.
    ...mockAes(nodeCrypto),
  };
});

type MockBinary = string | Uint8Array | ArrayBuffer;
function mockAes(nodeCrypto: typeof import('node:crypto')) {
  const toBytes = (input: MockBinary): Buffer =>
    typeof input === 'string' ? Buffer.from(input, 'base64') : Buffer.from(input as Uint8Array);
  const encode = (bytes: Buffer, encoding: 'hex' | 'base64') => bytes.toString(encoding);
  class AESEncryptionKey {
    constructor(private readonly key: Buffer) {}
    get size() {
      return this.key.length * 8;
    }
    static async generate(size = 256) {
      return new AESEncryptionKey(nodeCrypto.randomBytes(size / 8));
    }
    static async import(input: MockBinary, encoding?: 'hex' | 'base64') {
      if (typeof input !== 'string') return new AESEncryptionKey(toBytes(input));
      // Native throws MissingEncodingException for a string without an encoding.
      if (!encoding) throw new Error('MissingEncodingException');
      return new AESEncryptionKey(Buffer.from(input, encoding));
    }
    async bytes() {
      return new Uint8Array(this.key);
    }
    async encoded(encoding: 'hex' | 'base64') {
      return encode(this.key, encoding);
    }
    raw() {
      return this.key;
    }
  }
  class AESSealedData {
    constructor(private readonly all: Buffer) {}
    static fromCombined(combined: MockBinary) {
      return new AESSealedData(toBytes(combined));
    }
    async combined(encoding?: 'bytes' | 'base64') {
      return encoding === 'base64' ? encode(this.all, 'base64') : new Uint8Array(this.all);
    }
    raw() {
      return this.all;
    }
  }
  return {
    AESEncryptionKey,
    AESSealedData,
    aesEncryptAsync: async (plaintext: MockBinary, key: AESEncryptionKey) => {
      const iv = nodeCrypto.randomBytes(12);
      const cipher = nodeCrypto.createCipheriv('aes-256-gcm', key.raw(), iv);
      const body = Buffer.concat([cipher.update(toBytes(plaintext)), cipher.final()]);
      return new AESSealedData(Buffer.concat([iv, body, cipher.getAuthTag()]));
    },
    aesDecryptAsync: async (sealed: AESSealedData, key: AESEncryptionKey, options?: { output?: 'bytes' | 'base64' }) => {
      const all = sealed.raw();
      const decipher = nodeCrypto.createDecipheriv('aes-256-gcm', key.raw(), all.subarray(0, 12));
      decipher.setAuthTag(all.subarray(all.length - 16));
      const plain = Buffer.concat([decipher.update(all.subarray(12, all.length - 16)), decipher.final()]);
      return options?.output === 'base64' ? encode(plain, 'base64') : new Uint8Array(plain);
    },
  };
}

// expo-secure-store is the iOS keychain: an in-memory Map with the members of
// node_modules/expo-secure-store/build/SecureStore.d.ts (getItemAsync, setItemAsync, deleteItemAsync l.99-123).
// Keys are checked like the real one (SecureStore.js: /^[\w.-]+$/).
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  const checkKey = (key: string) => {
    if (!/^[\w.-]+$/.test(key)) throw new Error(`Invalid key provided to SecureStore: ${key}`);
  };
  return {
    AFTER_FIRST_UNLOCK: 0,
    getItemAsync: jest.fn(async (key: string) => {
      checkKey(key);
      return store.get(key) ?? null;
    }),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      checkKey(key);
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      checkKey(key);
      store.delete(key);
    }),
    __store: store,
  };
});

// AsyncStorage: the package's own in-memory mock.
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
