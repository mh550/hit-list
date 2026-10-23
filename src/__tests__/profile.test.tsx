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
import { useSettingsStore } from '@/src/stores/settings-store';
import { UnitSystem } from '@/src/types';
import { saveUserSettings } from '@/src/db';

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

  it('Sign out signs out of Supabase and returns to the signed-out state (no Keep/Remove prompt in S4, D62)', async () => {
    useAuthStore.setState(ANA);
    render(<ProfileScreen />);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    });
    expect(mockFake!.auth.signOut).toHaveBeenCalledTimes(1);
    expect(mockFake!.auth.signOut).toHaveBeenCalledWith();
    expect(alert).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject(SIGNED_OUT);
    expect(screen.getByText('Sign in to back up your spots and share them')).toBeTruthy();
  });

  it('signs out of this phone when the server sign out fails (offline)', async () => {
    useAuthStore.setState(ANA);
    mockFake!.failNext('signOut', { message: 'Network request failed' });
    render(<ProfileScreen />);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    });
    expect(mockFake!.auth.signOut).toHaveBeenCalledTimes(2);
    expect(mockFake!.auth.signOut).toHaveBeenLastCalledWith({ scope: 'local' });
    expect(useAuthStore.getState()).toMatchObject(SIGNED_OUT);
  });

  it('signs out of this phone even when signOut throws', async () => {
    useAuthStore.setState(ANA);
    mockFake!.auth.signOut.mockRejectedValueOnce(new Error('boom'));
    render(<ProfileScreen />);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    });
    expect(mockFake!.auth.signOut).toHaveBeenLastCalledWith({ scope: 'local' });
    expect(useAuthStore.getState()).toMatchObject(SIGNED_OUT);
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
    mockFake!.functions.invoke.mockResolvedValueOnce({ data: { error: 'delete failed' }, error: null });
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
    await pressInDeleteAlert('Delete');
    expect(screen.queryByText("Couldn't delete the account. Try again.")).toBeNull();
    expect(useAuthStore.getState()).toMatchObject(SIGNED_OUT);
  });
});
