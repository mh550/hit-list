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

// Mock react-native-reanimated
jest.mock('react-native-reanimated', () => {
  const Reanimated = jest.requireActual('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  return Reanimated;
});

// expo-sqlite: screens reach the DB through hooks that call useSQLiteContext, which throws outside a
// <SQLiteProvider>. Default to an empty db so a screen renders; any real query on it fails (and logs),
// so tests that save mock their actions or '@/src/db'. A test file's own jest.mock('expo-sqlite') wins.
jest.mock('expo-sqlite', () => ({ ...jest.requireActual('expo-sqlite'), useSQLiteContext: () => ({}) }));

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

