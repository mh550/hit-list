import type { ReactElement, ReactNode } from 'react';
import { render, screen } from '@testing-library/react-native';

// The global router mock's Tabs is not renderable; here Tabs renders its children and each Tabs.Screen stays a host
// element carrying its props, so the test can read name and options in order.
jest.mock('expo-router', () => {
  const Tabs = ({ children }: { children: ReactNode }) => children;
  Tabs.Screen = 'Tabs.Screen';
  return { Tabs };
});

import TabLayout from '@/app/(tabs)/_layout';

type TabOptions = { title?: string; tabBarIcon?: (p: { color: string; focused: boolean; size: number }) => ReactElement<{ name: string }> };

const tabScreens = () =>
  screen.UNSAFE_root.findAll((n) => (n.type as unknown) === 'Tabs.Screen').map((n) => ({
    name: n.props.name as string,
    options: n.props.options as TabOptions,
  }));

describe('TabLayout', () => {
  it('declares Spots, Lists, Profile in that order', () => {
    render(<TabLayout />);

    const tabs = tabScreens();
    expect(tabs.map((t) => t.name)).toEqual(['index', 'lists', 'profile']);
    expect(tabs.map((t) => t.options.title)).toEqual(['Spots', 'Lists', 'Profile']);
  });

  it("gives the Lists tab the 'list.bullet' icon", () => {
    render(<TabLayout />);

    const lists = tabScreens().find((t) => t.name === 'lists');
    const icon = lists?.options.tabBarIcon?.({ color: '#000', focused: false, size: 28 });
    expect(icon?.props.name).toBe('list.bullet');
  });
});
