import type { ReactElement, ReactNode } from 'react';
import { render, screen } from '@testing-library/react-native';

// The global router mock's Tabs is not renderable; here Tabs renders its children and each Tabs.Screen stays a host
// element carrying its props, so the test can read name and options in order. Redirect stays a host element too.
jest.mock('expo-router', () => {
  const Tabs = ({ children }: { children: ReactNode }) => children;
  Tabs.Screen = 'Tabs.Screen';
  return { Tabs, Redirect: 'Redirect' };
});

import TabLayout from '@/app/(tabs)/_layout';
import { SIGNED_OUT, useAuthStore, type AuthStatus } from '@/src/stores/auth-store';

beforeEach(() => {
  useAuthStore.setState({ ...SIGNED_OUT });
});

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

describe('TabLayout: onboarding', () => {
  const redirects = () => screen.UNSAFE_root.findAll((n) => (n.type as unknown) === 'Redirect');

  it("redirects to /auth/username instead of showing the tabs while the account is 'needs_username'", () => {
    useAuthStore.setState({ ...SIGNED_OUT, status: 'needs_username', userId: 'user-ana' });
    render(<TabLayout />);

    expect(redirects().map((n) => n.props.href)).toEqual(['/auth/username']);
    expect(tabScreens()).toEqual([]);
  });

  it.each<AuthStatus>(['signed_in', 'signed_out', 'unconfigured'])('shows the tabs, no redirect, when %s', (status) => {
    useAuthStore.setState({ ...SIGNED_OUT, status });
    render(<TabLayout />);

    expect(redirects()).toEqual([]);
    expect(tabScreens().map((t) => t.name)).toEqual(['index', 'lists', 'profile']);
  });
});
