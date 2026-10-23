import type { ReactElement, ReactNode } from 'react';
import { act, render, screen } from '@testing-library/react-native';

// The global router mock's Tabs is not renderable; here Tabs renders its children and each Tabs.Screen stays a host
// element carrying its props, so the test can read name and options in order. Redirect stays a host element too.
jest.mock('expo-router', () => {
  const Tabs = ({ children }: { children: ReactNode }) => children;
  Tabs.Screen = 'Tabs.Screen';
  return { Tabs, Redirect: 'Redirect' };
});

import TabLayout from '@/app/(tabs)/_layout';
import { SIGNED_OUT, useAuthStore, type AuthStatus } from '@/src/stores/auth-store';
import { useInboxStore, type InboxItem } from '@/src/stores/inbox-store';

beforeEach(() => {
  useAuthStore.setState({ ...SIGNED_OUT });
  useInboxStore.getState().clearInbox();
});

type TabOptions = {
  title?: string;
  tabBarBadge?: string | number;
  tabBarIcon?: (p: { color: string; focused: boolean; size: number }) => ReactElement<{ name: string }>;
};

const TAB_NAMES = ['index', 'lists', 'inbox', 'profile'];

const tabScreens = () =>
  screen.UNSAFE_root.findAll((n) => (n.type as unknown) === 'Tabs.Screen').map((n) => ({
    name: n.props.name as string,
    options: n.props.options as TabOptions,
  }));

describe('TabLayout', () => {
  it('declares Spots, Lists, Inbox, Profile in that order (D49)', () => {
    render(<TabLayout />);

    const tabs = tabScreens();
    expect(tabs.map((t) => t.name)).toEqual(TAB_NAMES);
    expect(tabs.map((t) => t.options.title)).toEqual(['Spots', 'Lists', 'Inbox', 'Profile']);
  });

  it("gives the Inbox tab the 'tray.fill' icon", () => {
    render(<TabLayout />);

    const inbox = tabScreens().find((t) => t.name === 'inbox');
    const icon = inbox?.options.tabBarIcon?.({ color: '#000', focused: false, size: 28 });
    expect(icon?.props.name).toBe('tray.fill');
  });

  it("gives the Lists tab the 'list.bullet' icon", () => {
    render(<TabLayout />);

    const lists = tabScreens().find((t) => t.name === 'lists');
    const icon = lists?.options.tabBarIcon?.({ color: '#000', focused: false, size: 28 });
    expect(icon?.props.name).toBe('list.bullet');
  });
});

describe('TabLayout: the Inbox badge', () => {
  const request = (id: string, created_at: string): InboxItem => ({
    kind: 'friend_request',
    id,
    created_at,
    friendshipId: id,
    from: { id: `rider-${id}`, username: id, display_name: null },
  });
  const inboxBadge = () => tabScreens().find((t) => t.name === 'inbox')?.options.tabBarBadge;

  beforeEach(() => {
    useAuthStore.setState({ ...SIGNED_OUT, status: 'signed_in', userId: 'rider-me' });
  });

  it('has no badge with nothing unseen', () => {
    useInboxStore.setState({ userId: 'rider-me', items: [request('a', '2026-10-20T10:00:00.000Z')], seenAt: '2026-10-20T10:00:00.000Z' });
    render(<TabLayout />);

    expect(inboxBadge()).toBeUndefined();
  });

  it("shows '2' with two unseen items, and drops when they are marked seen", () => {
    useInboxStore.setState({
      userId: 'rider-me',
      items: [request('a', '2026-10-21T10:00:00.000Z'), request('b', '2026-10-22T10:00:00.000Z')],
      seenAt: '2026-10-20T10:00:00.000Z',
    });
    render(<TabLayout />);
    expect(inboxBadge()).toBe('2');

    act(() => useInboxStore.setState({ seenAt: '2026-10-22T10:00:00.000Z' }));
    expect(inboxBadge()).toBeUndefined();
  });

  it('has no badge before the seen mark is loaded', () => {
    useInboxStore.setState({ userId: 'rider-me', items: [request('a', '2026-10-21T10:00:00.000Z')], seenAt: undefined });
    render(<TabLayout />);

    expect(inboxBadge()).toBeUndefined();
  });
});

describe('TabLayout: onboarding', () => {
  const redirects = () => screen.UNSAFE_root.findAll((n) => (n.type as unknown) === 'Redirect');

  it("redirects to /auth/username while the account is 'needs_username', keeping the tabs mounted", () => {
    useAuthStore.setState({ ...SIGNED_OUT, status: 'needs_username', userId: 'user-ana' });
    render(<TabLayout />);

    expect(redirects().map((n) => n.props.href)).toEqual(['/auth/username']);
    // Unmounting the Tabs would throw away the tabs under the sign-in sheet (their scroll, the map).
    expect(tabScreens().map((t) => t.name)).toEqual(TAB_NAMES);
  });

  it.each<AuthStatus>(['signed_in', 'signed_out', 'unconfigured'])('shows the tabs, no redirect, when %s', (status) => {
    useAuthStore.setState({ ...SIGNED_OUT, status });
    render(<TabLayout />);

    expect(redirects()).toEqual([]);
    expect(tabScreens().map((t) => t.name)).toEqual(TAB_NAMES);
  });
});
