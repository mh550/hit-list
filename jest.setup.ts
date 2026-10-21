import '@testing-library/react-native/matchers';

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
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
type MockFlashListProps<T> = {
  data?: readonly T[] | null;
  renderItem: (info: { item: T; index: number }) => unknown;
  keyExtractor?: (item: T, index: number) => string;
};
jest.mock('@shopify/flash-list', () => {
  const { Fragment, createElement } = jest.requireActual('react');
  return {
    FlashList: <T,>({ data, renderItem, keyExtractor }: MockFlashListProps<T>) =>
      createElement(
        Fragment,
        null,
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
  Accuracy: { Lowest: 1, Low: 2, Balanced: 3, High: 4, Highest: 5, BestForNavigation: 6 },
}));


// expo-crypto is native; back it with Node's crypto (same names as expo-crypto/build/Crypto.d.ts).
jest.mock('expo-crypto', () => {
  const nodeCrypto = jest.requireActual<typeof import('node:crypto')>('node:crypto');
  return {
    randomUUID: jest.fn(() => nodeCrypto.randomUUID()),
    getRandomValues: jest.fn((array: Uint8Array<ArrayBuffer>) => nodeCrypto.getRandomValues(array)),
    getRandomBytes: jest.fn((byteCount: number) => new Uint8Array(nodeCrypto.randomBytes(byteCount))),
  };
});
