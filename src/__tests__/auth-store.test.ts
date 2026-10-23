// useAuthInit mirrors the Supabase session into the auth store (status, userId, email, username,
// displayName). The client is the hand-written fake (helpers/fake-supabase.ts).
import { AppState, type AppStateStatus } from 'react-native';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AuthRetryableFetchError } from '@supabase/supabase-js';

import { createFakeSupabase, fakeSession, type FakeSupabase } from './helpers/fake-supabase';

let mockFake: FakeSupabase | null = null;
jest.mock('@/src/sync/client', () => ({
  getSupabase: () => mockFake,
  isConfigured: () => mockFake !== null,
}));

import { useAuthStore, SIGNED_OUT } from '@/src/stores/auth-store';
import { useAuthInit } from '@/src/hooks/use-auth-init';
import { useFriendsStore } from '@/src/stores/friends-store';

const ana = fakeSession({ userId: 'user-ana', email: 'ana@example.com' });

let appStateListeners: ((state: AppStateStatus) => void)[];

beforeEach(() => {
  mockFake = createFakeSupabase();
  useAuthStore.setState({ ...SIGNED_OUT });
  appStateListeners = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((type, listener) => {
    if (type === 'change') appStateListeners.push(listener as (state: AppStateStatus) => void);
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('useAuthStore', () => {
  it('starts signed out with no user', () => {
    useAuthStore.setState({ ...SIGNED_OUT });
    expect(useAuthStore.getState()).toMatchObject({
      status: 'signed_out',
      userId: null,
      email: null,
      username: null,
      displayName: null,
    });
  });

  it('setProfile sets the username and display name and marks the rider signed in', () => {
    useAuthStore.getState().setAuth({ ...SIGNED_OUT, status: 'needs_username', userId: 'u1', email: 'a@b.c' });

    useAuthStore.getState().setProfile('ana', 'Ana B');

    expect(useAuthStore.getState()).toMatchObject({
      status: 'signed_in',
      userId: 'u1',
      email: 'a@b.c',
      username: 'ana',
      displayName: 'Ana B',
    });
  });
});

describe('useAuthInit', () => {
  it("is 'unconfigured' when the build has no Supabase values", async () => {
    mockFake = null;

    renderHook(() => useAuthInit());

    await waitFor(() => expect(useAuthStore.getState().status).toBe('unconfigured'));
    expect(useAuthStore.getState().userId).toBeNull();
  });

  it("is 'signed_out' when there is no stored session", async () => {
    useAuthStore.setState({ ...SIGNED_OUT, status: 'unconfigured' });

    renderHook(() => useAuthInit());

    await waitFor(() => expect(useAuthStore.getState().status).toBe('signed_out'));
    expect(mockFake!.auth.getSession).toHaveBeenCalledTimes(1);
  });

  it("is 'needs_username' with the user id when the profile has no username", async () => {
    mockFake!.setSession(ana);
    mockFake!.profiles.set('user-ana', { username: null, display_name: null });

    renderHook(() => useAuthInit());

    await waitFor(() => expect(useAuthStore.getState().status).toBe('needs_username'));
    expect(useAuthStore.getState()).toMatchObject({ userId: 'user-ana', email: 'ana@example.com', username: null });
  });

  it("is 'signed_in' with the username and display name when the profile has them", async () => {
    mockFake!.setSession(ana);
    mockFake!.profiles.set('user-ana', { username: 'ana', display_name: 'Ana B' });

    renderHook(() => useAuthInit());

    await waitFor(() => expect(useAuthStore.getState().status).toBe('signed_in'));
    expect(useAuthStore.getState()).toMatchObject({
      userId: 'user-ana',
      email: 'ana@example.com',
      username: 'ana',
      displayName: 'Ana B',
    });
    expect(mockFake!.from).toHaveBeenCalledWith('profiles');
  });

  it("is 'signed_in' with no username when the profile fetch fails (offline launch), never 'needs_username'", async () => {
    mockFake!.setSession(ana);
    mockFake!.profiles.set('user-ana', { username: null, display_name: null });
    mockFake!.failNext('select', { message: 'Network request failed' });

    renderHook(() => useAuthInit());

    await waitFor(() => expect(useAuthStore.getState().status).toBe('signed_in'));
    expect(useAuthStore.getState()).toMatchObject({ userId: 'user-ana', username: null });
  });

  it("is 'signed_in' with no username when the profile row is missing", async () => {
    mockFake!.setSession(ana);

    renderHook(() => useAuthInit());

    await waitFor(() => expect(useAuthStore.getState().status).toBe('signed_in'));
    expect(useAuthStore.getState()).toMatchObject({ userId: 'user-ana', username: null });
  });

  it('keeps the account when the app becomes active offline with an expired token', async () => {
    // auth-js keeps the stored session and answers { session: null, error: AuthRetryableFetchError }.
    mockFake!.setSession(ana);
    mockFake!.failNext('select', { message: 'Network request failed' });
    renderHook(() => useAuthInit());
    await waitFor(() => expect(useAuthStore.getState().status).toBe('signed_in'));
    mockFake!.failNext('getSession', new AuthRetryableFetchError('Network request failed', 0));

    act(() => appStateListeners.forEach((listener) => listener('active')));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(useAuthStore.getState()).toMatchObject({ status: 'signed_in', userId: 'user-ana' });
  });

  it('picks the account up from TOKEN_REFRESHED after an offline launch with an expired token', async () => {
    useAuthStore.setState({ ...SIGNED_OUT, status: 'unconfigured' });
    mockFake!.profiles.set('user-ana', { username: 'ana', display_name: null });
    mockFake!.failNext('getSession', new AuthRetryableFetchError('Network request failed', 0));
    renderHook(() => useAuthInit());
    await waitFor(() => expect(mockFake!.auth.getSession).toHaveBeenCalled());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    // Not known yet: the stored session is still there, so this is not a sign-out.
    expect(useAuthStore.getState().status).not.toBe('signed_in');

    // Back online, the refresh ticker refreshes the stored session.
    act(() => mockFake!.emit('TOKEN_REFRESHED', ana));

    await waitFor(() => expect(useAuthStore.getState().status).toBe('signed_in'));
    expect(useAuthStore.getState().username).toBe('ana');
  });

  it("is 'signed_out' when getSession fails for good", async () => {
    mockFake!.failNext('getSession', { message: 'Invalid Refresh Token: Refresh Token Not Found', status: 400 });

    renderHook(() => useAuthInit());

    await waitFor(() => expect(mockFake!.auth.getSession).toHaveBeenCalled());
    await waitFor(() => expect(useAuthStore.getState().status).toBe('signed_out'));
  });

  it("refetches a profile that failed to load when the app becomes active", async () => {
    mockFake!.setSession(ana);
    mockFake!.profiles.set('user-ana', { username: 'ana', display_name: null });
    mockFake!.failNext('select', { message: 'Network request failed' });
    renderHook(() => useAuthInit());
    await waitFor(() => expect(useAuthStore.getState().status).toBe('signed_in'));
    expect(useAuthStore.getState().username).toBeNull();

    act(() => appStateListeners.forEach((listener) => listener('active')));

    await waitFor(() => expect(useAuthStore.getState().username).toBe('ana'));
  });

  it("is 'signed_out' with no user fields after SIGNED_OUT", async () => {
    mockFake!.setSession(ana);
    mockFake!.profiles.set('user-ana', { username: 'ana', display_name: 'Ana B' });
    renderHook(() => useAuthInit());
    await waitFor(() => expect(useAuthStore.getState().status).toBe('signed_in'));

    act(() => mockFake!.emit('SIGNED_OUT', null));

    await waitFor(() => expect(useAuthStore.getState().status).toBe('signed_out'));
    expect(useAuthStore.getState()).toMatchObject({
      userId: null,
      email: null,
      username: null,
      displayName: null,
    });
  });

  it('SIGNED_OUT empties the friends store (S6)', async () => {
    mockFake!.setSession(ana);
    mockFake!.profiles.set('user-ana', { username: 'ana', display_name: 'Ana B' });
    renderHook(() => useAuthInit());
    await waitFor(() => expect(useAuthStore.getState().status).toBe('signed_in'));
    const friend = { friendshipId: 'f1', created_at: '2026-10-20T10:00:00.000Z', profile: { id: 'user-ben', username: 'ben', display_name: null } };
    useFriendsStore.getState().applyFriends('user-ana', { friends: [friend], incoming: [], outgoing: [], blocked: [] });
    expect(useFriendsStore.getState().friends).toHaveLength(1);

    act(() => mockFake!.emit('SIGNED_OUT', null));

    await waitFor(() => expect(useFriendsStore.getState().friends).toEqual([]));
  });

  it('follows SIGNED_IN after launch', async () => {
    renderHook(() => useAuthInit());
    await waitFor(() => expect(mockFake!.auth.getSession).toHaveBeenCalled());
    mockFake!.profiles.set('user-ana', { username: 'ana', display_name: null });

    act(() => mockFake!.emit('SIGNED_IN', ana));

    await waitFor(() => expect(useAuthStore.getState().status).toBe('signed_in'));
    expect(useAuthStore.getState().username).toBe('ana');
  });

  it('keeps the latest event when an earlier profile fetch finishes after it', async () => {
    mockFake!.setSession(ana);
    mockFake!.profiles.set('user-ana', { username: 'ana', display_name: null });
    mockFake!.queryDelayMs = 5;
    renderHook(() => useAuthInit());

    // SIGNED_OUT lands while the launch's profile fetch is still in flight.
    act(() => mockFake!.emit('SIGNED_OUT', null));

    await waitFor(() => expect(mockFake!.from).toHaveBeenCalled());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(useAuthStore.getState().status).toBe('signed_out');
  });

  it('keeps a username saved during onboarding when an older profile fetch (no username yet) lands after it', async () => {
    mockFake!.setSession(ana);
    mockFake!.profiles.set('user-ana', { username: null, display_name: null });
    mockFake!.queryDelayMs = 200;
    useAuthStore.setState({ ...SIGNED_OUT, status: 'needs_username', userId: 'user-ana', email: 'ana@example.com' });
    renderHook(() => useAuthInit());
    await waitFor(() => expect(mockFake!.from).toHaveBeenCalled());

    // The username screen saves while the launch's fetch (which reads the row as it was, no username) is in flight.
    act(() => useAuthStore.getState().setProfile('ana', 'Ana B'));
    expect(useAuthStore.getState().status).toBe('signed_in');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });

    expect(useAuthStore.getState()).toMatchObject({ status: 'signed_in', userId: 'user-ana', username: 'ana' });
  });

  it("still shows 'needs_username' for a different account signing in", async () => {
    useAuthStore.setState({ ...SIGNED_OUT, status: 'signed_in', userId: 'user-bo', username: 'bo' });
    mockFake!.profiles.set('user-ana', { username: null, display_name: null });
    renderHook(() => useAuthInit());
    await waitFor(() => expect(mockFake!.auth.getSession).toHaveBeenCalled());

    act(() => mockFake!.emit('SIGNED_IN', ana));

    await waitFor(() => expect(useAuthStore.getState().status).toBe('needs_username'));
    expect(useAuthStore.getState().userId).toBe('user-ana');
  });

  it('ignores TOKEN_REFRESHED for the account it already shows (no profile refetch)', async () => {
    mockFake!.setSession(ana);
    mockFake!.profiles.set('user-ana', { username: 'ana', display_name: null });
    renderHook(() => useAuthInit());
    await waitFor(() => expect(useAuthStore.getState().status).toBe('signed_in'));
    const fetches = mockFake!.from.mock.calls.length;

    act(() => mockFake!.emit('TOKEN_REFRESHED', ana));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(mockFake!.from.mock.calls.length).toBe(fetches);
  });

  it('never awaits supabase inside the auth callback: it returns undefined and defers the fetch', async () => {
    renderHook(() => useAuthInit());
    await waitFor(() => expect(useAuthStore.getState().status).toBe('signed_out'));
    mockFake!.profiles.set('user-ana', { username: 'ana', display_name: null });
    const callback = mockFake!.auth.onAuthStateChange.mock.calls[0][0];
    const fetches = mockFake!.from.mock.calls.length;
    jest.useFakeTimers();

    const returned = callback('SIGNED_IN', ana);

    expect(returned).toBeUndefined();
    expect(mockFake!.from.mock.calls.length).toBe(fetches);
    act(() => jest.runOnlyPendingTimers());
    expect(mockFake!.from.mock.calls.length).toBe(fetches + 1);
  });

  it('unsubscribes from auth changes on unmount', async () => {
    const { unmount } = renderHook(() => useAuthInit());
    await waitFor(() => expect(useAuthStore.getState().status).toBe('signed_out'));
    expect(mockFake!.listenerCount()).toBe(1);
    const { subscription } = mockFake!.auth.onAuthStateChange.mock.results[0].value.data;

    unmount();

    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
    expect(mockFake!.listenerCount()).toBe(0);
  });
});
