// useAdoption (S5-06): mounted next to useAuthInit; when a rider is signed in it adopts the phone's rows (or switches
// accounts, asking first when the last account's changes never reached the server, D66), then syncs.
import { Alert, AppState, type AlertButton, type AppStateStatus } from 'react-native';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { createFakeSupabase, type FakeSupabase } from './helpers/fake-supabase';

let mockFake: FakeSupabase | null = null;
jest.mock('@/src/sync/client', () => ({
  getSupabase: () => mockFake,
  isConfigured: () => mockFake !== null,
}));
jest.mock('@/src/sync/engine', () => ({ syncNow: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/src/sync/adopt', () => ({ adopt: jest.fn() }));
jest.mock('@/src/db/sync', () => ({ countPending: jest.fn() }));
jest.mock('@/src/sync/auth', () => ({ signOutOfAccount: jest.fn().mockResolvedValue(undefined) }));

import { syncNow } from '@/src/sync/engine';
import { adopt } from '@/src/sync/adopt';
import { countPending } from '@/src/db/sync';
import { signOutOfAccount } from '@/src/sync/auth';
import { useAdoption } from '@/src/hooks/use-adoption';
import { currentOwnerId } from '@/src/sync/owner';
import { SIGNED_OUT, useAuthStore } from '@/src/stores/auth-store';
import { INITIAL_SYNC, useSyncStore } from '@/src/stores/sync-store';

const mockAdopt = jest.mocked(adopt);
const mockSyncNow = jest.mocked(syncNow);
const mockCountPending = jest.mocked(countPending);

const signIn = (userId = 'rider-b') =>
  act(() =>
    useAuthStore.setState({ status: 'signed_in', userId, email: 'b@example.com', username: 'b', displayName: null }),
  );

const alertButtons = () => (jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? []) as AlertButton[];
const press = async (text: string) => {
  const button = alertButtons().find((b) => b.text === text);
  if (!button?.onPress) throw new Error(`no ${text} button`);
  await act(async () => {
    button.onPress!();
  });
};

let appStateListeners: ((state: AppStateStatus) => void)[];
const appStateTo = (state: AppStateStatus) =>
  act(async () => {
    for (const listener of appStateListeners) listener(state);
  });

beforeEach(() => {
  appStateListeners = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((type, listener) => {
    if (type === 'change') appStateListeners.push(listener as (state: AppStateStatus) => void);
    return {
      remove: () => {
        appStateListeners = appStateListeners.filter((l) => l !== listener);
      },
    } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
  mockFake = createFakeSupabase();
  mockAdopt.mockReset().mockResolvedValue('done');
  mockSyncNow.mockClear();
  mockCountPending.mockReset().mockResolvedValue(0);
  jest.mocked(signOutOfAccount).mockClear();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  useAuthStore.setState(SIGNED_OUT);
  useSyncStore.setState(INITIAL_SYNC);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useAdoption', () => {
  it('signed in at launch (the DB is ready: it mounts inside DBInitializer): adopts, then syncs', async () => {
    signIn();
    renderHook(() => useAdoption());

    await waitFor(() => expect(mockSyncNow).toHaveBeenCalledTimes(1));
    expect(mockAdopt).toHaveBeenCalledWith(useSQLiteContext(), 'rider-b');
    expect(mockSyncNow).toHaveBeenCalledWith(useSQLiteContext());
    expect(mockAdopt.mock.invocationCallOrder[0]).toBeLessThan(mockSyncNow.mock.invocationCallOrder[0]);
  });

  it("adopts when the status becomes 'signed_in', not before (signed out, unconfigured, needs_username)", async () => {
    renderHook(() => useAdoption());
    act(() => useAuthStore.setState({ ...SIGNED_OUT, status: 'needs_username', userId: 'rider-b' }));
    expect(mockAdopt).not.toHaveBeenCalled();

    signIn();

    await waitFor(() => expect(mockSyncNow).toHaveBeenCalledTimes(1));
    expect(mockAdopt).toHaveBeenCalledTimes(1);
  });

  it('new spots and lists get the rider as owner only once adoption is done, and none after sign-out', async () => {
    let finish: (value: 'done') => void = () => {};
    mockAdopt.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    renderHook(() => useAdoption());
    signIn();
    expect(currentOwnerId()).toBeUndefined();

    await act(async () => finish('done'));
    expect(currentOwnerId()).toBe('rider-b');

    act(() => useAuthStore.setState(SIGNED_OUT));
    expect(currentOwnerId()).toBeUndefined();
  });

  it('a failed adoption warns, does not sync and sets no owner', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockAdopt.mockRejectedValueOnce(new Error('disk full'));
    signIn();
    renderHook(() => useAdoption());

    await waitFor(() => expect(warn).toHaveBeenCalledWith('[sync] adoption failed:', 'disk full'));
    expect(mockSyncNow).not.toHaveBeenCalled();
    expect(currentOwnerId()).toBeUndefined();
  });

  it("asks before removing the last account's changes that never reached the server (D66)", async () => {
    mockAdopt.mockResolvedValueOnce('needs_confirm');
    mockCountPending.mockResolvedValueOnce(3);
    signIn();
    renderHook(() => useAdoption());

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    const [title, message] = jest.mocked(Alert.alert).mock.calls[0];
    expect(title).toBe('Changes not backed up');
    expect(message).toBe(
      "3 changes made on this phone haven't reached your last account. Signing in here removes them from this phone. " +
        'To keep them, cancel and sign in with that account first.',
    );
    expect(alertButtons().map((b) => [b.text, b.style])).toEqual([
      ['Cancel', 'cancel'],
      ['Remove and continue', 'destructive'],
    ]);
    expect(mockSyncNow).not.toHaveBeenCalled();
    expect(currentOwnerId()).toBeUndefined();
  });

  it('says 1 change for one', async () => {
    mockAdopt.mockResolvedValueOnce('needs_confirm');
    mockCountPending.mockResolvedValueOnce(1);
    signIn();
    renderHook(() => useAdoption());

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect(jest.mocked(Alert.alert).mock.calls[0][1]).toMatch(/^1 change made on this phone hasn't reached/);
  });

  it('Cancel signs this account out and removes nothing', async () => {
    mockAdopt.mockResolvedValueOnce('needs_confirm');
    signIn();
    renderHook(() => useAdoption());
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());

    await press('Cancel');

    expect(signOutOfAccount).toHaveBeenCalledWith(mockFake);
    expect(useAuthStore.getState().status).toBe('signed_out');
    expect(mockAdopt).toHaveBeenCalledTimes(1);
    expect(mockSyncNow).not.toHaveBeenCalled();
  });

  it('Remove and continue adopts with confirmSwitch, then syncs', async () => {
    mockAdopt.mockResolvedValueOnce('needs_confirm');
    signIn();
    renderHook(() => useAdoption());
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());

    await press('Remove and continue');

    expect(mockAdopt).toHaveBeenLastCalledWith(useSQLiteContext(), 'rider-b', { confirmSwitch: true });
    await waitFor(() => expect(mockSyncNow).toHaveBeenCalledTimes(1));
    expect(currentOwnerId()).toBe('rider-b');
  });

  it('adopts again for a different account, and not again for the same one', async () => {
    signIn('rider-a');
    const { rerender } = renderHook(() => useAdoption());
    await waitFor(() => expect(mockSyncNow).toHaveBeenCalledTimes(1));
    rerender({});
    act(() => useAuthStore.setState({ username: 'a2' }));
    expect(mockAdopt).toHaveBeenCalledTimes(1);

    act(() => useAuthStore.setState(SIGNED_OUT));
    signIn('rider-b');

    await waitFor(() => expect(mockSyncNow).toHaveBeenCalledTimes(2));
    expect(mockAdopt).toHaveBeenLastCalledWith(useSQLiteContext(), 'rider-b');
  });

  it('an adoption that finishes after sign-out sets no owner and does not sync', async () => {
    let finish: (value: 'done') => void = () => {};
    mockAdopt.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    signIn();
    renderHook(() => useAdoption());
    act(() => useAuthStore.setState(SIGNED_OUT));

    await act(async () => finish('done'));

    expect(currentOwnerId()).toBeUndefined();
    expect(mockSyncNow).not.toHaveBeenCalled();
  });

  it('a failed adoption is tried again when the app comes back to the foreground', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockAdopt.mockRejectedValueOnce(new Error('database is locked'));
    signIn();
    renderHook(() => useAdoption());
    await waitFor(() => expect(warn).toHaveBeenCalled());

    await appStateTo('active');

    await waitFor(() => expect(mockSyncNow).toHaveBeenCalledTimes(1));
    expect(mockAdopt).toHaveBeenCalledTimes(2);
    expect(currentOwnerId()).toBe('rider-b');
  });

  it('a done adoption is not run again on the foreground', async () => {
    signIn();
    renderHook(() => useAdoption());
    await waitFor(() => expect(mockSyncNow).toHaveBeenCalledTimes(1));

    await appStateTo('active');

    expect(mockAdopt).toHaveBeenCalledTimes(1);
  });

  it("a stale confirm alert's Cancel signs no one out once that rider is gone", async () => {
    mockAdopt.mockResolvedValueOnce('needs_confirm');
    signIn();
    renderHook(() => useAdoption());
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    act(() => useAuthStore.setState(SIGNED_OUT));
    signIn('rider-c');

    await press('Cancel');

    expect(signOutOfAccount).not.toHaveBeenCalled();
    expect(useAuthStore.getState().userId).toBe('rider-c');
  });
});
