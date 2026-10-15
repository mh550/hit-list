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

// expo-image renders as React Native's Image so tests can assert on `source`.
jest.mock('expo-image', () => ({ Image: jest.requireActual('react-native').Image }));

// SF Symbols are native-only; render a View whose testID names the symbol.
jest.mock('@/components/ui/icon-symbol', () => {
  const { createElement } = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return { IconSymbol: ({ name }: { name: string }) => createElement(View, { testID: `icon-${name}` }) };
});

// FlashList needs a measured layout; render it as React Native's FlatList.
jest.mock('@shopify/flash-list', () => ({ FlashList: jest.requireActual('react-native').FlatList }));

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

