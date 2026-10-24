import { AppState, type AppStateStatus } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import { useSQLiteContext } from 'expo-sqlite';

jest.mock('@/src/sync/engine', () => ({
  SYNC_INTERVAL_MS: 300_000,
  syncNow: jest.fn().mockResolvedValue(undefined),
}));

import { syncNow } from '@/src/sync/engine';
import { useSync } from '@/src/hooks/use-sync';
import { SIGNED_OUT, useAuthStore } from '@/src/stores/auth-store';

const mockSyncNow = jest.mocked(syncNow);
const signIn = (userId = 'rider-me') =>
  useAuthStore.setState({ status: 'signed_in', userId, email: 'me@example.com', username: 'me', displayName: null });

let listeners: ((state: AppStateStatus) => void)[];
const removed = jest.fn();
const appStateTo = (state: AppStateStatus) =>
  act(() => {
    for (const listener of listeners) listener(state);
  });

beforeEach(() => {
  jest.useFakeTimers();
  mockSyncNow.mockClear();
  removed.mockClear();
  listeners = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((type, listener) => {
    if (type === 'change') listeners.push(listener as (state: AppStateStatus) => void);
    return {
      remove: () => {
        removed();
        listeners = listeners.filter((l) => l !== listener);
      },
    } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
  useAuthStore.setState(SIGNED_OUT);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('useSync', () => {
  it('syncs once the DB is ready (it mounts inside DBInitializer) when signed in', () => {
    signIn();
    renderHook(() => useSync());

    expect(mockSyncNow).toHaveBeenCalledTimes(1);
    expect(mockSyncNow).toHaveBeenCalledWith(useSQLiteContext());
  });

  it('does nothing signed out, unconfigured or while the username is missing', () => {
    const { rerender } = renderHook(() => useSync());
    act(() => useAuthStore.setState({ ...SIGNED_OUT, status: 'unconfigured' }));
    act(() => useAuthStore.setState({ ...SIGNED_OUT, status: 'needs_username', userId: 'rider-me' }));
    rerender({});
    appStateTo('active');
    act(() => jest.advanceTimersByTime(600_000));

    expect(mockSyncNow).not.toHaveBeenCalled();
  });

  it('syncs when the rider signs in while the app is open', () => {
    renderHook(() => useSync());
    expect(mockSyncNow).not.toHaveBeenCalled();

    act(() => signIn());

    expect(mockSyncNow).toHaveBeenCalledTimes(1);
  });

  it("syncs again on AppState 'active', not on 'background' or 'inactive'", () => {
    signIn();
    renderHook(() => useSync());
    mockSyncNow.mockClear();

    appStateTo('inactive');
    appStateTo('background');
    expect(mockSyncNow).not.toHaveBeenCalled();

    appStateTo('active');
    expect(mockSyncNow).toHaveBeenCalledTimes(1);
  });

  it('syncs every 300 000 ms while active', () => {
    signIn();
    renderHook(() => useSync());
    mockSyncNow.mockClear();

    act(() => jest.advanceTimersByTime(299_999));
    expect(mockSyncNow).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(1));
    expect(mockSyncNow).toHaveBeenCalledTimes(1);
    act(() => jest.advanceTimersByTime(300_000));
    expect(mockSyncNow).toHaveBeenCalledTimes(2);
  });

  it('stops the interval in the background and starts it again on active', () => {
    signIn();
    renderHook(() => useSync());
    mockSyncNow.mockClear();

    appStateTo('background');
    act(() => jest.advanceTimersByTime(900_000));
    expect(mockSyncNow).not.toHaveBeenCalled();

    appStateTo('active');
    expect(mockSyncNow).toHaveBeenCalledTimes(1);
    act(() => jest.advanceTimersByTime(300_000));
    expect(mockSyncNow).toHaveBeenCalledTimes(2);
  });

  it('a second active while already active does not start a second interval', () => {
    signIn();
    renderHook(() => useSync());
    appStateTo('active');
    mockSyncNow.mockClear();

    act(() => jest.advanceTimersByTime(300_000));

    expect(mockSyncNow).toHaveBeenCalledTimes(1);
  });

  it('signing out stops the interval and the AppState listener', () => {
    signIn();
    renderHook(() => useSync());
    mockSyncNow.mockClear();

    act(() => useAuthStore.setState(SIGNED_OUT));
    act(() => jest.advanceTimersByTime(900_000));
    appStateTo('active');

    expect(mockSyncNow).not.toHaveBeenCalled();
    expect(removed).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('unmounting clears the interval and the listener', () => {
    signIn();
    const { unmount } = renderHook(() => useSync());

    unmount();

    expect(jest.getTimerCount()).toBe(0);
    expect(removed).toHaveBeenCalledTimes(1);
  });

  it('another rider signing in starts over for that rider', () => {
    signIn('rider-a');
    renderHook(() => useSync());
    mockSyncNow.mockClear();

    act(() => signIn('rider-b'));

    expect(mockSyncNow).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(1);
  });
});
