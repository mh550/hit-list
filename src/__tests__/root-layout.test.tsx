import React from 'react';
import { Text, View } from 'react-native';
import { render, screen } from '@testing-library/react-native';
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
jest.mock('@/src/components/DBInitializer', () => ({
  DBInitializer: ({ children }: { children: React.ReactNode }) => children,
}));

import RootLayout from '@/app/_layout';

describe('RootLayout', () => {
  it('wraps the whole tree in a flex-1 GestureHandlerRootView', () => {
    render(<RootLayout />);

    const roots = screen.UNSAFE_getAllByType(GestureHandlerRootView);
    expect(roots).toHaveLength(1);
    expect(roots[0].props.style).toEqual({ flex: 1 });
    // The navigator and its screens sit inside it.
    expect(screen.getByTestId('stack')).toBeOnTheScreen();
    expect(screen.getByText('screen:spot/[id]/index')).toBeOnTheScreen();
    expect(roots[0].findByProps({ testID: 'stack' })).toBeTruthy();
  });
});

describe('RootLayout: photo viewer', () => {
  it('registers spot/[id]/photos as a full-screen modal without a header', () => {
    render(<RootLayout />);

    const viewer = screen.UNSAFE_getAllByProps({ name: 'spot/[id]/photos' })[0];
    expect(viewer.props.options).toEqual({ presentation: 'fullScreenModal', headerShown: false });
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
    render(<RootLayout />);

    const list = screen.UNSAFE_getAllByProps({ name: 'list/[id]/index' })[0];
    expect(list.props.options).toEqual({ title: 'Hit list' });
  });
});
