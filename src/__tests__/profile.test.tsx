import React from 'react';
import { Alert, type AlertButton } from 'react-native';
import { act, render, screen, fireEvent } from '@testing-library/react-native';
import { useRouter } from 'expo-router';

import { createFakeSupabase, type FakeSupabase } from './helpers/fake-supabase';

let mockFake: FakeSupabase | null = null;
jest.mock('@/src/sync/client', () => ({
  getSupabase: () => mockFake,
  isConfigured: () => mockFake !== null,
}));

import ProfileScreen from '@/app/(tabs)/profile';
import { SIGNED_OUT, useAuthStore, type AuthSnapshot } from '@/src/stores/auth-store';
import { SESSION_STORAGE_KEY, sessionStorage } from '@/src/sync/session-storage';
import { useSettingsStore } from '@/src/stores/settings-store';
import { UnitSystem } from '@/src/types';
import { saveUserSettings } from '@/src/db';
import { countPending, resetFailed } from '@/src/db/sync';
import { syncNow } from '@/src/sync/engine';
import { releaseAccountData, removeLocalAccountData } from '@/src/sync/adopt';
import { INITIAL_SYNC, useSyncStore } from '@/src/stores/sync-store';

jest.mock('@/src/sync/engine', () => ({ syncNow: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/src/db/sync', () => ({
  resetFailed: jest.fn().mockResolvedValue(undefined),
  countPending: jest.fn().mockResolvedValue(0),
}));
jest.mock('@/src/sync/adopt', () => ({
  removeLocalAccountData: jest.fn().mockResolvedValue(true),
  releaseAccountData: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-sqlite', () => ({
  useSQLiteContext: () => ({
    runAsync: jest.fn().mockResolvedValue(undefined),
    getAllAsync: jest.fn().mockResolvedValue([]),
    getFirstAsync: jest.fn().mockResolvedValue(null),
  }),
  SQLiteProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/src/db', () => ({
  saveUserSettings: jest.fn().mockResolvedValue(undefined),
  migrateDb: jest.fn().mockResolvedValue(undefined),
  getSpots: jest.fn().mockResolvedValue([]),
  getUserSettings: jest.fn().mockResolvedValue(null),
}));

beforeEach(() => {
  mockFake = createFakeSupabase();
  useAuthStore.setState(SIGNED_OUT);
});

describe('ProfileScreen', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      units: UnitSystem.Imperial,
      batch_import_radius: 50,
    });
  });

  it('renders units toggle', () => {
    render(<ProfileScreen />);
    expect(screen.getByText('Imperial')).toBeTruthy();
    expect(screen.getByText('Metric')).toBeTruthy();
  });

  it('has no My Gear section or gear chips (D22)', () => {
    render(<ProfileScreen />);
    expect(screen.queryByText(/my gear/i)).toBeNull();
    expect(screen.queryByText('winch')).toBeNull();
    expect(screen.queryByText('bungee')).toBeNull();
  });

  it('shows current units as selected', () => {
    render(<ProfileScreen />);
    const imperialButton = screen.getByText('Imperial');
    // Imperial should be the active/selected option
    expect(imperialButton).toBeTruthy();
  });

  it('switching units updates the store', () => {
    render(<ProfileScreen />);
    fireEvent.press(screen.getByText('Metric'));
    expect(useSettingsStore.getState().units).toBe(UnitSystem.Metric);
  });

  it('shows the 50 m default radius in feet for Imperial (D23)', () => {
    render(<ProfileScreen />);
    expect(screen.getByText('Import radius · ft')).toBeTruthy();
    expect(screen.getByLabelText('Import radius in feet').props.value).toBe('164');
  });

  it('re-renders the radius in metres after switching to Metric', () => {
    render(<ProfileScreen />);
    fireEvent.press(screen.getByText('Metric'));
    expect(screen.getByText('Import radius · m')).toBeTruthy();
    expect(screen.queryByText('Import radius · ft')).toBeNull();
    expect(screen.getByLabelText('Import radius in metres').props.value).toBe('50');
  });

  it('stores typed feet as metres on blur', async () => {
    render(<ProfileScreen />);
    const field = screen.getByLabelText('Import radius in feet');
    fireEvent.changeText(field, '328');
    await act(async () => {
      fireEvent(field, 'blur');
    });
    expect(useSettingsStore.getState().batch_import_radius).toBe(100);
    expect(saveUserSettings).toHaveBeenLastCalledWith(expect.anything(), {
      units: UnitSystem.Imperial,
      batch_import_radius: 100,
    });
    expect(screen.getByLabelText('Import radius in feet').props.value).toBe('328');
  });

  it('restores the previous value on blur after invalid text', async () => {
    jest.mocked(saveUserSettings).mockClear();
    render(<ProfileScreen />);
    const field = screen.getByLabelText('Import radius in feet');
    fireEvent.changeText(field, 'abc');
    await act(async () => {
      fireEvent(field, 'blur');
    });
    expect(screen.getByLabelText('Import radius in feet').props.value).toBe('164');
    expect(useSettingsStore.getState().batch_import_radius).toBe(50);
    expect(saveUserSettings).not.toHaveBeenCalled();
  });

  it('saves feet typed before a switch to Metric as feet', async () => {
    render(<ProfileScreen />);
    fireEvent.changeText(screen.getByLabelText('Import radius in feet'), '328');
    await act(async () => {
      fireEvent.press(screen.getByText('Metric'));
    });
    expect(useSettingsStore.getState().batch_import_radius).toBe(100);
    expect(screen.getByLabelText('Import radius in metres').props.value).toBe('100');
  });

  it('leaves the stored metres alone when the field is blurred unchanged', async () => {
    jest.mocked(saveUserSettings).mockClear();
    render(<ProfileScreen />);
    const field = screen.getByLabelText('Import radius in feet');
    await act(async () => {
      fireEvent(field, 'blur');
    });
    expect(useSettingsStore.getState().batch_import_radius).toBe(50);
    expect(saveUserSettings).not.toHaveBeenCalled();
  });

  it('writes nothing when a radius that is not whole feet is blurred unchanged (M7-02)', async () => {
    // 50.4 m shows as 165 ft, and 165 ft reads back as 50 m: only the untouched-field guard keeps 50.4.
    useSettingsStore.setState({ batch_import_radius: 50.4 });
    jest.mocked(saveUserSettings).mockClear();
    render(<ProfileScreen />);
    const field = screen.getByLabelText('Import radius in feet');
    expect(field.props.value).toBe('165');
    await act(async () => {
      fireEvent(field, 'blur');
    });
    expect(useSettingsStore.getState().batch_import_radius).toBe(50.4);
    expect(saveUserSettings).not.toHaveBeenCalled();
  });

  it('shows the whole metres it stored after blur, so 165 ft reads 164 (D32)', async () => {
    render(<ProfileScreen />);
    const field = screen.getByLabelText('Import radius in feet');
    fireEvent.changeText(field, '165');
    await act(async () => {
      fireEvent(field, 'blur');
    });
    expect(useSettingsStore.getState().batch_import_radius).toBe(50);
    expect(screen.getByLabelText('Import radius in feet').props.value).toBe('164');
  });

  it('explains that the radius also drives the nearby-spot offer (D25)', () => {
    render(<ProfileScreen />);
    expect(
      screen.getByText(
        'Photos this close together import as one spot, and a new spot this close to one you have offers to join it.',
      ),
    ).toBeTruthy();
  });
});

describe('Import Photos entry point', () => {
  it('is not on the Profile tab', () => {
    // D12 (Michael, 2026-10-15): Import Photos moved to the Spots tab; Profile must not offer it.
    render(<ProfileScreen />);

    // Case-insensitive so a relabelled "Import photos" button would also be caught; anchored so help text that
    // mentions importing photos does not count.
    expect(screen.queryByText(/^\s*import photos\s*$/i)).toBeNull();
    expect(screen.queryByLabelText(/import photos/i)).toBeNull();
  });
});

const ANA: AuthSnapshot = {
  status: 'signed_in',
  userId: 'user-ana',
  email: 'ana@example.com',
  username: 'ana',
  displayName: 'Ana B',
};

const DELETE_TITLE = 'Delete your account?';
const DELETE_MESSAGE =
  'Your spots, photos, hit lists and sends are deleted from the server. Spots on this phone stay until you remove them.';

/** The Units and Import radius sections, which every account state keeps. */
function expectSettingsSections() {
  expect(screen.getByText('Units')).toBeTruthy();
  expect(screen.getByText('Imperial')).toBeTruthy();
  expect(screen.getByLabelText('Import radius in feet')).toBeTruthy();
}

/** The buttons of the last Alert.alert call. */
function lastAlertButtons(spy: jest.SpyInstance): AlertButton[] {
  return (spy.mock.calls.at(-1)?.[2] ?? []) as AlertButton[];
}

describe('Profile account section (S4-05)', () => {
  let router: { push: jest.Mock };
  let alert: jest.SpyInstance;

  beforeEach(() => {
    useSettingsStore.setState({ units: UnitSystem.Imperial, batch_import_radius: 50 });
    router = { push: jest.fn() };
    jest.mocked(useRouter).mockReturnValue(router as never);
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alert.mockRestore();
  });

  /** Presses Sign out (its backup runs), then one button of the alert that follows. */
  async function signOutVia(text: string) {
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    });
    const button = lastAlertButtons(alert).find((b) => b.text === text);
    if (!button) throw new Error(`no ${text} button`);
    await act(async () => {
      button.onPress?.();
    });
  }

  /** Opens the Delete account alert and presses one of its buttons. */
  async function pressInDeleteAlert(text: 'Delete' | 'Cancel') {
    fireEvent.press(screen.getByRole('button', { name: 'Delete account' }));
    expect(alert).toHaveBeenLastCalledWith(DELETE_TITLE, DELETE_MESSAGE, expect.any(Array));
    const button = lastAlertButtons(alert).find((b) => b.text === text);
    await act(async () => {
      button?.onPress?.();
    });
  }

  it('says accounts are not set up in a build without Supabase values, with no Sign in', () => {
    mockFake = null;
    useAuthStore.setState({ ...SIGNED_OUT, status: 'unconfigured' });
    render(<ProfileScreen />);
    expect(screen.getByText('Account')).toBeTruthy();
    expect(screen.getByText("Accounts aren't set up in this build")).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
    expect(screen.queryByText('Sign in to back up your spots and share them')).toBeNull();
    expectSettingsSections();
  });

  it('treats a missing client as unconfigured even before the auth store has caught up', () => {
    mockFake = null;
    render(<ProfileScreen />);
    expect(screen.getByText("Accounts aren't set up in this build")).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
  });

  it('signed out: explains signing in and pushes the sign-in screen', () => {
    render(<ProfileScreen />);
    expect(screen.getByText('Account')).toBeTruthy();
    expect(screen.getByText('Sign in to back up your spots and share them')).toBeTruthy();
    expect(
      screen.getByText('Signing in uploads the spots already on this phone to your account. Nothing is deleted.'),
    ).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(router.push).toHaveBeenCalledWith('/auth/sign-in');
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete account' })).toBeNull();
    expectSettingsSections();
  });

  it('signed in: shows the @username, display name and email with Sign out and Delete account', () => {
    useAuthStore.setState(ANA);
    render(<ProfileScreen />);
    expect(screen.getByText('Account')).toBeTruthy();
    expect(screen.getByText('@ana')).toBeTruthy();
    expect(screen.getByText('Ana B')).toBeTruthy();
    expect(screen.getByText('ana@example.com')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete account' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
    expect(screen.queryByText("Accounts aren't set up in this build")).toBeNull();
    expectSettingsSections();
  });

  it('signed in with no username or display name (profile not loaded) shows the email and no @', () => {
    useAuthStore.setState({ ...ANA, username: null, displayName: null });
    render(<ProfileScreen />);
    expect(screen.getByText('ana@example.com')).toBeTruthy();
    expect(screen.queryByText(/^@/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
  });

  it('Sign out, then Keep, signs out of Supabase and returns to the signed-out state', async () => {
    useAuthStore.setState(ANA);
    render(<ProfileScreen />);
    await signOutVia('Keep');
    expect(mockFake!.auth.signOut).toHaveBeenCalledTimes(1);
    expect(mockFake!.auth.signOut).toHaveBeenCalledWith();
    expect(useAuthStore.getState()).toMatchObject(SIGNED_OUT);
    expect(screen.getByText('Sign in to back up your spots and share them')).toBeTruthy();
  });

  it('signs out of this phone when the server sign out fails (offline)', async () => {
    useAuthStore.setState(ANA);
    mockFake!.failNext('signOut', { message: 'Network request failed' });
    const remove = jest.spyOn(sessionStorage, 'removeItem');
    render(<ProfileScreen />);
    await signOutVia('Keep');
    expect(mockFake!.auth.signOut).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(SESSION_STORAGE_KEY);
    expect(useAuthStore.getState()).toMatchObject(SIGNED_OUT);
    remove.mockRestore();
  });

  it('signs out of this phone even when signOut throws', async () => {
    useAuthStore.setState(ANA);
    mockFake!.auth.signOut.mockRejectedValueOnce(new Error('boom'));
    const remove = jest.spyOn(sessionStorage, 'removeItem');
    render(<ProfileScreen />);
    await signOutVia('Keep');
    expect(remove).toHaveBeenCalledWith(SESSION_STORAGE_KEY);
    expect(useAuthStore.getState()).toMatchObject(SIGNED_OUT);
    remove.mockRestore();
  });

  it('clears the stored session itself when auth-js cannot (offline with an expired access token)', async () => {
    // auth-js 2.118: the session read fails (the refresh is offline), so signOut() returns that error before removing
    // anything, and the stored session would sign the rider back in.
    useAuthStore.setState(ANA);
    const offline = { error: { name: 'AuthRetryableFetchError', message: 'Network request failed', status: 0 } };
    mockFake!.auth.signOut.mockResolvedValueOnce(offline as never);
    const remove = jest.spyOn(sessionStorage, 'removeItem');
    render(<ProfileScreen />);
    await signOutVia('Keep');
    expect(mockFake!.auth.signOut).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(SESSION_STORAGE_KEY);
    expect(useAuthStore.getState()).toMatchObject(SIGNED_OUT);
    remove.mockRestore();
  });

  it('leaves the stored session to auth-js when a sign out works', async () => {
    useAuthStore.setState(ANA);
    const remove = jest.spyOn(sessionStorage, 'removeItem');
    render(<ProfileScreen />);
    await signOutVia('Keep');
    expect(remove).not.toHaveBeenCalled();
    remove.mockRestore();
  });

  it('does not show an old delete error after signing out and back in', async () => {
    useAuthStore.setState(ANA);
    mockFake!.failNext('invoke', { message: 'boom' });
    render(<ProfileScreen />);
    await pressInDeleteAlert('Delete');
    expect(screen.getByText("Couldn't delete the account. Try again.")).toBeTruthy();
    // Signed out from elsewhere (a revoked refresh token), then in again while the tab stays mounted.
    act(() => useAuthStore.getState().setAuth(SIGNED_OUT));
    act(() => useAuthStore.getState().setAuth(ANA));
    expect(screen.queryByText("Couldn't delete the account. Try again.")).toBeNull();
  });

  it('Delete account asks first, with a destructive Delete and a Cancel', () => {
    useAuthStore.setState(ANA);
    render(<ProfileScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Delete account' }));
    expect(alert).toHaveBeenCalledWith(DELETE_TITLE, DELETE_MESSAGE, expect.any(Array));
    const buttons = lastAlertButtons(alert);
    expect(buttons.map((b) => b.text)).toEqual(['Cancel', 'Delete']);
    expect(buttons.find((b) => b.text === 'Cancel')?.style).toBe('cancel');
    expect(buttons.find((b) => b.text === 'Delete')?.style).toBe('destructive');
  });

  it('Cancel in the delete alert calls nothing', async () => {
    useAuthStore.setState(ANA);
    render(<ProfileScreen />);
    await pressInDeleteAlert('Cancel');
    expect(mockFake!.functions.invoke).not.toHaveBeenCalled();
    expect(mockFake!.auth.signOut).not.toHaveBeenCalled();
    expect(useAuthStore.getState().status).toBe('signed_in');
  });

  it('Delete calls the account-delete function, then signs out', async () => {
    useAuthStore.setState(ANA);
    render(<ProfileScreen />);
    await pressInDeleteAlert('Delete');
    expect(mockFake!.functions.invoke).toHaveBeenCalledTimes(1);
    expect(mockFake!.functions.invoke.mock.calls[0][0]).toBe('account-delete');
    expect(mockFake!.auth.signOut).toHaveBeenCalledTimes(1);
    expect(mockFake!.functions.invoke.mock.invocationCallOrder[0]).toBeLessThan(
      mockFake!.auth.signOut.mock.invocationCallOrder[0],
    );
    expect(useAuthStore.getState()).toMatchObject(SIGNED_OUT);
    expect(screen.getByText('Sign in to back up your spots and share them')).toBeTruthy();
  });

  it('a function error shows "Couldn\'t delete the account. Try again." and stays signed in', async () => {
    useAuthStore.setState(ANA);
    mockFake!.failNext('invoke', { message: 'Edge Function returned a non-2xx status code' });
    render(<ProfileScreen />);
    await pressInDeleteAlert('Delete');
    expect(screen.getByText("Couldn't delete the account. Try again.")).toBeTruthy();
    expect(screen.queryByText(/non-2xx/)).toBeNull();
    expect(mockFake!.auth.signOut).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject(ANA);
    expect(screen.getByRole('button', { name: 'Delete account' })).toBeTruthy();
  });

  it('an answer without ok: true counts as a failure', async () => {
    useAuthStore.setState(ANA);
    mockFake!.functions.invoke.mockResolvedValueOnce({ data: { error: 'delete failed' }, error: null } as never);
    render(<ProfileScreen />);
    await pressInDeleteAlert('Delete');
    expect(screen.getByText("Couldn't delete the account. Try again.")).toBeTruthy();
    expect(mockFake!.auth.signOut).not.toHaveBeenCalled();
  });

  it('a thrown invoke counts as a failure', async () => {
    useAuthStore.setState(ANA);
    mockFake!.functions.invoke.mockRejectedValueOnce(new Error('offline'));
    render(<ProfileScreen />);
    await pressInDeleteAlert('Delete');
    expect(screen.getByText("Couldn't delete the account. Try again.")).toBeTruthy();
    expect(mockFake!.auth.signOut).not.toHaveBeenCalled();
  });

  it('shows Deleting… while the function runs and ignores a second Delete', async () => {
    useAuthStore.setState(ANA);
    let finish: (value: { data: unknown; error: null }) => void = () => {};
    mockFake!.functions.invoke.mockImplementationOnce(
      () => new Promise((resolve) => (finish = resolve)) as never,
    );
    render(<ProfileScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Delete account' }));
    const del = lastAlertButtons(alert).find((b) => b.text === 'Delete');
    await act(async () => {
      del?.onPress?.();
    });
    const deleting = screen.getByRole('button', { name: 'Deleting…' });
    expect(deleting.props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByRole('button', { name: 'Sign out' }).props.accessibilityState).toMatchObject({
      disabled: true,
    });
    // The alert's Delete again (a stale alert, a double tap) starts no second delete.
    await act(async () => {
      del?.onPress?.();
    });
    expect(mockFake!.functions.invoke).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish({ data: { ok: true }, error: null });
    });
    expect(useAuthStore.getState()).toMatchObject(SIGNED_OUT);
  });

  it('a retry after a failed delete clears the error and can succeed', async () => {
    useAuthStore.setState(ANA);
    mockFake!.failNext('invoke', { message: 'boom' });
    render(<ProfileScreen />);
    await pressInDeleteAlert('Delete');
    expect(screen.getByText("Couldn't delete the account. Try again.")).toBeTruthy();
    // The retry is still running: the old error is already gone.
    let finish: (value: { data: unknown; error: null }) => void = () => {};
    mockFake!.functions.invoke.mockImplementationOnce(
      () => new Promise((resolve) => (finish = resolve)) as never,
    );
    await pressInDeleteAlert('Delete');
    expect(screen.getByRole('button', { name: 'Deleting…' })).toBeTruthy();
    expect(screen.queryByText("Couldn't delete the account. Try again.")).toBeNull();
    await act(async () => {
      finish({ data: { ok: true }, error: null });
    });
    expect(useAuthStore.getState()).toMatchObject(SIGNED_OUT);
  });
});

describe('Profile backup status (S5-05)', () => {
  const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

  beforeEach(() => {
    useSettingsStore.setState({ units: UnitSystem.Imperial, batch_import_radius: 50 });
    useSyncStore.setState(INITIAL_SYNC);
    jest.mocked(syncNow).mockClear();
    jest.mocked(resetFailed).mockClear();
  });

  it("signed in and just synced: 'Backed up · just now', no failed line", () => {
    useAuthStore.setState(ANA);
    useSyncStore.setState({ userId: ANA.userId, lastSyncAt: minutesAgo(0) });
    render(<ProfileScreen />);

    expect(screen.getByText('Backed up · just now')).toBeTruthy();
    expect(screen.queryByText(/not backed up/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it("'Backed up · 3 min ago' from lastSyncAt", () => {
    useAuthStore.setState(ANA);
    useSyncStore.setState({ userId: ANA.userId, lastSyncAt: minutesAgo(3) });
    render(<ProfileScreen />);

    expect(screen.getByText('Backed up · 3 min ago')).toBeTruthy();
  });

  it("before the first sync (or one of another rider): 'Not backed up yet'", () => {
    useAuthStore.setState(ANA);
    render(<ProfileScreen />);
    expect(screen.getByText('Not backed up yet')).toBeTruthy();

    act(() => useSyncStore.setState({ userId: 'user-bo', lastSyncAt: minutesAgo(1), failedCount: 2 }));
    expect(screen.getByText('Not backed up yet')).toBeTruthy();
    expect(screen.queryByText(/changes? not backed up/)).toBeNull();
  });

  it("failedCount > 0: '3 changes not backed up' with Retry, which resets the failed rows then syncs", async () => {
    useAuthStore.setState(ANA);
    useSyncStore.setState({ userId: ANA.userId, lastSyncAt: minutesAgo(3), failedCount: 3 });
    render(<ProfileScreen />);

    expect(screen.getByText('3 changes not backed up')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    });

    expect(resetFailed).toHaveBeenCalledTimes(1);
    expect(syncNow).toHaveBeenCalledTimes(1);
    expect(jest.mocked(resetFailed).mock.invocationCallOrder[0]).toBeLessThan(
      jest.mocked(syncNow).mock.invocationCallOrder[0],
    );
  });

  it('Retry is disabled while a sync runs', () => {
    useAuthStore.setState(ANA);
    useSyncStore.setState({ userId: ANA.userId, failedCount: 3, syncing: true });
    render(<ProfileScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Retry' }));

    expect(resetFailed).not.toHaveBeenCalled();
  });

  it('a Retry whose reset fails warns and does not sync', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.mocked(resetFailed).mockRejectedValueOnce(new Error('disk full'));
    useAuthStore.setState(ANA);
    useSyncStore.setState({ userId: ANA.userId, failedCount: 3 });
    render(<ProfileScreen />);

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    });

    expect(warn).toHaveBeenCalled();
    expect(syncNow).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("one failed row reads '1 change not backed up'", () => {
    useAuthStore.setState(ANA);
    useSyncStore.setState({ userId: ANA.userId, failedCount: 1 });
    render(<ProfileScreen />);

    expect(screen.getByText('1 change not backed up')).toBeTruthy();
  });

  it('signed out shows no backup line', () => {
    useSyncStore.setState({ userId: ANA.userId, lastSyncAt: minutesAgo(0), failedCount: 3 });
    render(<ProfileScreen />);

    expect(screen.queryByText(/backed up ·|not backed up/i)).toBeNull();
  });
});

describe('Profile sign out and delete: Keep / Remove from this phone (S5-06, D38, D51, D69)', () => {
  let alert: jest.SpyInstance;

  beforeEach(() => {
    useSettingsStore.setState({ units: UnitSystem.Imperial, batch_import_radius: 50 });
    useSyncStore.setState(INITIAL_SYNC);
    jest.mocked(syncNow).mockReset().mockResolvedValue(undefined);
    jest.mocked(countPending).mockReset().mockResolvedValue(0);
    jest.mocked(removeLocalAccountData).mockReset().mockResolvedValue(true);
    jest.mocked(releaseAccountData).mockReset().mockResolvedValue(undefined);
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alert.mockRestore();
    jest.useRealTimers();
  });

  const pressSignOut = () =>
    act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    });
  const pressInAlert = async (text: string) => {
    const button = lastAlertButtons(alert).find((b) => b.text === text);
    if (!button) throw new Error(`no ${text} button`);
    await act(async () => {
      button.onPress?.();
    });
  };

  it('Sign out backs up first, then asks "Keep spots on this phone?" with Keep, Remove from this phone and Cancel', async () => {
    useAuthStore.setState(ANA);
    render(<ProfileScreen />);

    await pressSignOut();

    expect(syncNow).toHaveBeenCalledTimes(1);
    expect(jest.mocked(syncNow).mock.invocationCallOrder[0]).toBeLessThan(
      jest.mocked(countPending).mock.invocationCallOrder[0],
    );
    expect(alert).toHaveBeenCalledWith(
      'Keep spots on this phone?',
      "They're backed up in your account either way.",
      expect.any(Array),
    );
    expect(lastAlertButtons(alert).map((b) => [b.text, b.style])).toEqual([
      ['Keep', 'default'],
      ['Remove from this phone', 'destructive'],
      ['Cancel', 'cancel'],
    ]);
    expect(mockFake!.auth.signOut).not.toHaveBeenCalled();
  });

  it('Keep signs out and leaves the rows on the phone', async () => {
    useAuthStore.setState(ANA);
    render(<ProfileScreen />);
    await pressSignOut();

    await pressInAlert('Keep');

    expect(removeLocalAccountData).not.toHaveBeenCalled();
    expect(mockFake!.auth.signOut).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState()).toMatchObject(SIGNED_OUT);
  });

  it("Remove from this phone removes the rider's rows and photos, then signs out", async () => {
    useAuthStore.setState(ANA);
    render(<ProfileScreen />);
    await pressSignOut();

    await pressInAlert('Remove from this phone');

    expect(removeLocalAccountData).toHaveBeenCalledWith(expect.anything(), ANA.userId);
    expect(jest.mocked(removeLocalAccountData).mock.invocationCallOrder[0]).toBeLessThan(
      mockFake!.auth.signOut.mock.invocationCallOrder[0],
    );
    expect(useAuthStore.getState()).toMatchObject(SIGNED_OUT);
  });

  it('a change that appeared before Remove ran: nothing removed, still signed in, says so', async () => {
    jest.mocked(removeLocalAccountData).mockResolvedValueOnce(false);
    useAuthStore.setState(ANA);
    render(<ProfileScreen />);
    await pressSignOut();

    await pressInAlert('Remove from this phone');

    expect(mockFake!.auth.signOut).not.toHaveBeenCalled();
    expect(useAuthStore.getState().status).toBe('signed_in');
    expect(screen.getByText("Some changes aren't backed up yet, so nothing was removed.")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign out' }).props.accessibilityState).toMatchObject({
      disabled: false,
    });
  });

  it('a Remove that fails warns, stays signed in and says so', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.mocked(removeLocalAccountData).mockRejectedValueOnce(new Error('disk full'));
    useAuthStore.setState(ANA);
    render(<ProfileScreen />);
    await pressSignOut();

    await pressInAlert('Remove from this phone');

    expect(warn).toHaveBeenCalled();
    expect(mockFake!.auth.signOut).not.toHaveBeenCalled();
    expect(screen.getByText("Couldn't remove the spots from this phone. Try again.")).toBeTruthy();
    warn.mockRestore();
  });

  it("changes still waiting: '3 changes aren't backed up yet' with Cancel and Sign out anyway, no Remove", async () => {
    jest.mocked(countPending).mockResolvedValue(3);
    useAuthStore.setState(ANA);
    render(<ProfileScreen />);
    await pressSignOut();

    expect(alert).toHaveBeenCalledWith(
      "3 changes aren't backed up yet",
      "Sign out anyway and they'll back up next time you sign in to this account.",
      expect.any(Array),
    );
    expect(lastAlertButtons(alert).map((b) => [b.text, b.style])).toEqual([
      ['Cancel', 'cancel'],
      ['Sign out anyway', 'destructive'],
    ]);

    await pressInAlert('Sign out anyway');
    expect(removeLocalAccountData).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject(SIGNED_OUT);
  });

  it("one change waiting: '1 change isn't backed up yet'", async () => {
    jest.mocked(countPending).mockResolvedValue(1);
    useAuthStore.setState(ANA);
    render(<ProfileScreen />);
    await pressSignOut();

    expect(alert.mock.calls.at(-1)?.[0]).toBe("1 change isn't backed up yet");
  });

  it('Cancel keeps the rider signed in and Sign out usable again', async () => {
    jest.mocked(countPending).mockResolvedValue(3);
    useAuthStore.setState(ANA);
    render(<ProfileScreen />);
    await pressSignOut();

    await pressInAlert('Cancel');

    expect(mockFake!.auth.signOut).not.toHaveBeenCalled();
    expect(useAuthStore.getState().status).toBe('signed_in');
    expect(screen.getByRole('button', { name: 'Sign out' }).props.accessibilityState).toMatchObject({
      disabled: false,
    });
  });

  it("shows 'Signing out…' while the last backup runs, and asks after 10 s even if it never finishes (offline)", async () => {
    jest.useFakeTimers();
    jest.mocked(syncNow).mockReturnValue(new Promise(() => {}));
    useAuthStore.setState(ANA);
    render(<ProfileScreen />);
    await pressSignOut();

    expect(screen.getByRole('button', { name: 'Signing out…' }).props.accessibilityState).toMatchObject({
      disabled: true,
    });
    expect(alert).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    expect(alert).toHaveBeenCalledWith('Keep spots on this phone?', expect.any(String), expect.any(Array));
  });

  it('a count that fails is treated as changes waiting: no Remove offered', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.mocked(countPending).mockRejectedValue(new Error('locked'));
    useAuthStore.setState(ANA);
    render(<ProfileScreen />);
    await pressSignOut();

    expect(alert.mock.calls.at(-1)?.[0]).toBe("Some changes aren't backed up yet");
    expect(lastAlertButtons(alert).map((b) => b.text)).toEqual(['Cancel', 'Sign out anyway']);
    warn.mockRestore();
  });

  /** Delete account → Delete → the function succeeds. */
  async function deleteAccountNow() {
    fireEvent.press(screen.getByRole('button', { name: 'Delete account' }));
    await pressInAlert('Delete');
  }

  it('Delete account ends signed out with "Your account is deleted. Keep the spots on this phone?" (D51)', async () => {
    useAuthStore.setState(ANA);
    render(<ProfileScreen />);

    await deleteAccountNow();

    expect(useAuthStore.getState()).toMatchObject(SIGNED_OUT);
    expect(alert).toHaveBeenLastCalledWith(
      'Account deleted',
      'Your account is deleted. Keep the spots on this phone?',
      expect.any(Array),
    );
    expect(lastAlertButtons(alert).map((b) => [b.text, b.style])).toEqual([
      ['Keep', 'default'],
      ['Remove from this phone', 'destructive'],
    ]);
  });

  it('Keep after Delete account makes the spots phone-only (D67)', async () => {
    useAuthStore.setState(ANA);
    render(<ProfileScreen />);
    await deleteAccountNow();

    await pressInAlert('Keep');

    expect(releaseAccountData).toHaveBeenCalledWith(expect.anything(), ANA.userId);
    expect(removeLocalAccountData).not.toHaveBeenCalled();
  });

  it('Remove after Delete account removes them, waiting changes too (they have no account left to reach)', async () => {
    useAuthStore.setState(ANA);
    render(<ProfileScreen />);
    await deleteAccountNow();

    await pressInAlert('Remove from this phone');

    expect(removeLocalAccountData).toHaveBeenCalledWith(expect.anything(), ANA.userId, { discardPending: true });
    expect(releaseAccountData).not.toHaveBeenCalled();
  });

  it('a failed delete asks nothing about the phone', async () => {
    mockFake!.failNext('invoke', { message: 'boom' });
    useAuthStore.setState(ANA);
    render(<ProfileScreen />);

    await deleteAccountNow();

    expect(alert).toHaveBeenCalledTimes(1);
    expect(releaseAccountData).not.toHaveBeenCalled();
  });
});
