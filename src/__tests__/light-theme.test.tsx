import { render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import appConfig from '../../app.json';

// Capture the theme RootLayout hands to the navigation ThemeProvider. The global expo-router mock has no
// theme members, so this file supplies its own with distinguishable DefaultTheme / DarkTheme objects.
const mockThemeValues: unknown[] = [];
jest.mock('expo-router', () => {
  const { Fragment, createElement } = jest.requireActual('react');
  const Stack = Object.assign(
    ({ children }: { children?: ReactNode }) => createElement(Fragment, null, children),
    { Screen: () => null },
  );
  return {
    DefaultTheme: { dark: false, name: 'default' },
    DarkTheme: { dark: true, name: 'dark' },
    Stack,
    ThemeProvider: ({ value, children }: { value: unknown; children?: ReactNode }) => {
      mockThemeValues.push(value);
      return createElement(Fragment, null, children);
    },
  };
});

jest.mock('expo-sqlite', () => ({
  SQLiteProvider: ({ children }: { children?: ReactNode }) => children,
}));
// _layout imports reanimated for its side effect only; the global mock needs native worklets.
jest.mock('react-native-reanimated', () => ({}));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('@/src/components/DBInitializer', () => ({
  DBInitializer: ({ children }: { children?: ReactNode }) => children,
}));
jest.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: jest.fn(() => 'dark') }));

import { DefaultTheme } from 'expo-router';
import RootLayout from '@/app/_layout';

describe('light-only appearance', () => {
  beforeEach(() => {
    mockThemeValues.length = 0;
  });

  it('app.json forces light mode', () => {
    // Screens set no backgrounds and use light-theme text colours, so the OS dark mode makes headings near-invisible.
    expect(appConfig.expo.userInterfaceStyle).toBe('light');
  });

  it('RootLayout uses the default (light) navigation theme even when the phone is in dark mode', () => {
    // useColorScheme is mocked to 'dark' above; the navigation theme must still be the light one.
    render(<RootLayout />);

    expect(mockThemeValues.length).toBeGreaterThan(0);
    expect(mockThemeValues[mockThemeValues.length - 1]).toBe(DefaultTheme);
  });
});
