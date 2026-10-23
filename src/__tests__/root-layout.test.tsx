import React from 'react';
import { Text, View } from 'react-native';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

// The root layout's providers, reduced to their children: the test checks the tree shape, not the
// database or the navigator.
jest.mock('expo-router', () => {
  const { createElement, Fragment } = jest.requireActual('react');
  const { Text: MockText, View: MockView } = jest.requireActual('react-native');
  const MockStack = ({ children }: { children: React.ReactNode }) =>
    createElement(MockView, { testID: 'stack' }, children);
  MockStack.Screen = ({ name }: { name: string; options?: object }) =>
    createElement(MockText, null, `screen:${name}`);
  return {
    DefaultTheme: {},
    ThemeProvider: ({ children }: { children: React.ReactNode }) => createElement(Fragment, null, children),
    Stack: MockStack,
  };
});
jest.mock('expo-sqlite', () => ({
  SQLiteProvider: ({ children }: { children: React.ReactNode }) => children,
}));
// DBInitializer renders its children only once the DB is ready; mockDbReady stands in for that.
let mockDbReady = true;
jest.mock('@/src/components/DBInitializer', () => ({
  DBInitializer: ({ children }: { children: React.ReactNode }) => (mockDbReady ? children : null),
}));
// The hand-written fake client (helpers/fake-supabase.ts) stands in for Supabase.
let mockFake: FakeSupabase;
jest.mock('@/src/sync/client', () => ({ getSupabase: () => mockFake, isConfigured: () => true }));

// The sync and adoption hooks need the DB connection; here they only report that they mounted.
const mockUseSync = jest.fn();
jest.mock('@/src/hooks/use-sync', () => ({ useSync: () => mockUseSync() }));
const mockUseAdoption = jest.fn();
jest.mock('@/src/hooks/use-adoption', () => ({ useAdoption: () => mockUseAdoption() }));

import { createFakeSupabase, type FakeSupabase } from './helpers/fake-supabase';
import { useAuthStore, SIGNED_OUT } from '@/src/stores/auth-store';

import { SafeAreaProvider } from 'react-native-safe-area-context';
import { showToast, useToastStore } from '@/src/stores/toast-store';

import RootLayout from '@/app/_layout';

// expo-router's ExpoRoot puts a SafeAreaProvider above the root layout on the phone; the ToastHost reads it.
const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const SafeArea = ({ children }: { children: React.ReactNode }) => (
  <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>
);
const renderLayout = () => render(<RootLayout />, { wrapper: SafeArea });

beforeEach(() => {
  mockFake = createFakeSupabase();
});

describe('RootLayout', () => {
  it('wraps the whole tree in a flex-1 GestureHandlerRootView', () => {
    renderLayout();

    const roots = screen.UNSAFE_getAllByType(GestureHandlerRootView);
    expect(roots).toHaveLength(1);
    expect(roots[0].props.style).toEqual({ flex: 1 });
    // The navigator and its screens sit inside it.
    expect(screen.getByTestId('stack')).toBeOnTheScreen();
    expect(screen.getByText('screen:spot/[id]/index')).toBeOnTheScreen();
    expect(roots[0].findByProps({ testID: 'stack' })).toBeTruthy();
  });
});

describe('RootLayout: toast (S7-04)', () => {
  it('draws the toast line over the screens once the DB is ready', () => {
    mockDbReady = true;
    renderLayout();
    expect(screen.queryByRole('alert')).toBeNull();

    act(() => showToast('Sent to @ana'));
    expect(screen.getByText('Sent to @ana')).toBeOnTheScreen();
    act(() => useToastStore.setState({ text: null }));
  });
});

describe('RootLayout: photo viewer', () => {
  it('registers spot/[id]/photos as a full-screen modal without a header', () => {
    renderLayout();

    const viewer = screen.UNSAFE_getAllByProps({ name: 'spot/[id]/photos' })[0];
    expect(viewer.props.options).toEqual({ presentation: 'fullScreenModal', headerShown: false });
  });
});

describe('RootLayout: area picker', () => {
  it("registers area/index as a full-screen modal titled 'Pick an area'", () => {
    renderLayout();

    const picker = screen.UNSAFE_getAllByProps({ name: 'area/index' })[0];
    expect(picker.props.options).toEqual({ presentation: 'fullScreenModal', title: 'Pick an area' });
  });
});

describe('RootLayout: sign-in screens', () => {
  it("registers auth/sign-in as a modal titled 'Sign in' and auth/code titled 'Enter code'", () => {
    renderLayout();

    expect(screen.UNSAFE_getAllByProps({ name: 'auth/sign-in' })[0].props.options).toEqual({
      presentation: 'modal',
      title: 'Sign in',
    });
    expect(screen.UNSAFE_getAllByProps({ name: 'auth/code' })[0].props.options).toEqual({ title: 'Enter code' });
  });

  it("registers auth/username titled 'Your username' with no back button and no swipe to dismiss", () => {
    renderLayout();

    expect(screen.UNSAFE_getAllByProps({ name: 'auth/username' })[0].props.options).toEqual({
      title: 'Your username',
      headerBackVisible: false,
      gestureEnabled: false,
    });
  });
});

describe('RootLayout: friends (S6-03)', () => {
  it("registers friends/index titled 'Friends'", () => {
    renderLayout();

    expect(screen.UNSAFE_getAllByProps({ name: 'friends/index' })[0].props.options).toEqual({ title: 'Friends' });
  });
});

describe("gesture-handler's jest setup", () => {
  it('lets a test drive a gesture through jest-utils', () => {
    const onEnd = jest.fn();
    const tap = Gesture.Tap().withTestId('tap').onEnd(() => onEnd());
    render(
      <GestureHandlerRootView>
        <GestureDetector gesture={tap}>
          <View>
            <Text>target</Text>
          </View>
        </GestureDetector>
      </GestureHandlerRootView>,
    );

    fireGestureHandler(getByGestureTestId('tap'));

    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});

describe('RootLayout: hit list screen', () => {
  it("registers list/[id]/index titled 'Hit list' until the screen names it", () => {
    renderLayout();

    const list = screen.UNSAFE_getAllByProps({ name: 'list/[id]/index' })[0];
    expect(list.props.options).toEqual({ title: 'Hit list' });
  });
});

describe('RootLayout: auth', () => {
  beforeEach(() => {
    mockDbReady = true;
    useAuthStore.setState({ ...SIGNED_OUT, status: 'unconfigured' });
  });

  it('starts auth (useAuthInit) once the DB is ready', async () => {
    renderLayout();

    await waitFor(() => expect(useAuthStore.getState().status).toBe('signed_out'));
    expect(mockFake.auth.getSession).toHaveBeenCalledTimes(1);
    expect(mockFake.auth.onAuthStateChange).toHaveBeenCalledTimes(1);
  });

  it('does not start auth before DBInitializer lets its children render', () => {
    mockDbReady = false;

    renderLayout();

    expect(mockFake.auth.getSession).not.toHaveBeenCalled();
    expect(useAuthStore.getState().status).toBe('unconfigured');
  });

  it('mounts useSync once the DB is ready, and not before', () => {
    mockUseSync.mockClear();
    mockDbReady = false;
    const { unmount } = renderLayout();
    expect(mockUseSync).not.toHaveBeenCalled();
    unmount();

    mockDbReady = true;
    renderLayout();
    expect(mockUseSync).toHaveBeenCalled();
  });

  it('mounts useAdoption (adopt, then sync, S5-06) once the DB is ready, and not before', () => {
    mockUseAdoption.mockClear();
    mockDbReady = false;
    const { unmount } = renderLayout();
    expect(mockUseAdoption).not.toHaveBeenCalled();
    unmount();

    mockDbReady = true;
    renderLayout();
    expect(mockUseAdoption).toHaveBeenCalled();
  });
});
