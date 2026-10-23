// The username screen (S4-04): after the first sign-in the rider picks an @username (required) and a display name
// (optional, D63). Live validation under the field, 'Done' only when valid, a taken name reported in place; success
// marks the account signed in and lands on the Profile tab.
import { TextInput } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useRouter } from 'expo-router';

import { createFakeSupabase, type FakeSupabase } from './helpers/fake-supabase';

let mockFake: FakeSupabase | null = null;
jest.mock('@/src/sync/client', () => ({
  getSupabase: () => mockFake,
  isConfigured: () => mockFake !== null,
}));

import UsernameScreen from '@/app/auth/username';
import { SIGNED_OUT, useAuthStore } from '@/src/stores/auth-store';

let router: {
  push: jest.Mock;
  back: jest.Mock;
  replace: jest.Mock;
  dismissAll: jest.Mock;
  dismissTo: jest.Mock;
  canDismiss: jest.Mock;
};

beforeEach(() => {
  mockFake = createFakeSupabase({ userId: 'user-ana' });
  mockFake.profiles.set('user-ana', { username: null, display_name: null });
  useAuthStore.setState({
    ...SIGNED_OUT,
    status: 'needs_username',
    userId: 'user-ana',
    email: 'ana@example.com',
  });
  // Reached from the code screen: the root stack is [(tabs), auth/sign-in, auth/username].
  router = {
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    dismissAll: jest.fn(),
    dismissTo: jest.fn(),
    canDismiss: jest.fn(() => true),
  };
  jest.mocked(useRouter).mockReturnValue(router as never);
});

const usernameField = () => screen.getByLabelText('Username');
const displayNameField = () => screen.getByLabelText('Display name');
const doneButton = () => screen.getByRole('button', { name: 'Done' });

function type(field: ReturnType<typeof usernameField>, text: string) {
  fireEvent.changeText(field, text);
}

async function pressDone() {
  await act(async () => {
    fireEvent.press(doneButton());
  });
}

describe('UsernameScreen', () => {
  it('asks for an @username and an optional display name', () => {
    render(<UsernameScreen />);
    expect(screen.getByText('Pick your @username')).toBeTruthy();
    // A visual prefix; VoiceOver reads the field's label instead.
    expect(screen.getByText('@', { includeHiddenElements: true })).toBeTruthy();
    expect(usernameField().props.autoCapitalize).toBe('none');
    expect(usernameField().props.autoCorrect).toBe(false);
    expect(displayNameField().props.maxLength).toBe(50);
    expect(screen.getByText('Optional. Shown to friends.')).toBeTruthy();
  });

  it('shows the validation message under the field as the rider types, none when valid', () => {
    render(<UsernameScreen />);
    // Nothing to complain about before the first keystroke.
    expect(screen.queryByText('Pick a username')).toBeNull();
    type(usernameField(), 'ab');
    expect(screen.getByText('At least 3 characters')).toBeTruthy();
    type(usernameField(), 'an-a');
    expect(screen.getByText('Only letters, numbers, _ and .')).toBeTruthy();
    type(usernameField(), 'a'.repeat(21));
    expect(screen.getByText('At most 20 characters')).toBeTruthy();
    type(usernameField(), '');
    expect(screen.getByText('Pick a username')).toBeTruthy();
    type(usernameField(), 'ana');
    for (const message of ['Pick a username', 'At least 3 characters', 'At most 20 characters', 'Only letters, numbers, _ and .']) {
      expect(screen.queryByText(message)).toBeNull();
    }
  });

  it('announces the validation message politely', () => {
    render(<UsernameScreen />);
    type(usernameField(), 'ab');
    expect(screen.getByText('At least 3 characters').props.accessibilityLiveRegion).toBe('polite');
  });

  it("keeps 'Done' disabled while the username is invalid", () => {
    render(<UsernameScreen />);
    expect(doneButton()).toBeDisabled();
    type(usernameField(), 'ab');
    expect(doneButton()).toBeDisabled();
    type(usernameField(), 'ana');
    expect(doneButton()).not.toBeDisabled();
  });

  it('drops an @ the rider types in front, since the field already shows one', () => {
    render(<UsernameScreen />);
    type(usernameField(), '@ana');
    expect(usernameField().props.value).toBe('ana');
    expect(doneButton()).not.toBeDisabled();
  });

  it('saves the normalized username and the trimmed display name to their profile', async () => {
    render(<UsernameScreen />);
    type(usernameField(), '  Ana.B ');
    type(displayNameField(), '  Ana B ');
    await pressDone();

    expect(mockFake!.from).toHaveBeenCalledWith('profiles');
    const query = mockFake!.from.mock.results[0].value;
    expect(query.update).toHaveBeenCalledWith({ username: 'ana.b', display_name: 'Ana B' });
    expect(query.eq).toHaveBeenCalledWith('id', 'user-ana');
    // The updated row comes back, so an update that changed nothing is not taken for a save.
    expect(query.select).toHaveBeenCalledWith('id');
    expect(mockFake!.profiles.get('user-ana')).toEqual({ username: 'ana.b', display_name: 'Ana B' });
  });

  it('saves a blank display name as null', async () => {
    render(<UsernameScreen />);
    type(usernameField(), 'ana');
    type(displayNameField(), '   ');
    await pressDone();

    const query = mockFake!.from.mock.results[0].value;
    expect(query.update).toHaveBeenCalledWith({ username: 'ana', display_name: null });
  });

  it('marks the account signed in and drops back to the Profile tab under sign-in', async () => {
    render(<UsernameScreen />);
    type(usernameField(), 'ana');
    type(displayNameField(), 'Ana B');
    await pressDone();

    expect(useAuthStore.getState()).toMatchObject({
      status: 'signed_in',
      userId: 'user-ana',
      email: 'ana@example.com',
      username: 'ana',
      displayName: 'Ana B',
    });
    // replace would put a second (tabs) above the Sign in sheet; dismissTo pops to the tabs already there.
    expect(router.dismissTo).toHaveBeenCalledWith('/(tabs)/profile');
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('replaces the route with the Profile tab when it is the only screen (the tabs redirected here at launch)', async () => {
    router.canDismiss.mockReturnValue(false);
    render(<UsernameScreen />);
    type(usernameField(), 'ana');
    await pressDone();

    expect(router.replace).toHaveBeenCalledWith('/(tabs)/profile');
    expect(router.dismissTo).not.toHaveBeenCalled();
  });

  it("shows 'Couldn't save. Try again.' when the update changed no row (no profile, or the session is gone)", async () => {
    mockFake!.profiles.delete('user-ana');
    render(<UsernameScreen />);
    type(usernameField(), 'ana');
    await pressDone();

    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't save. Try again.");
    expect(useAuthStore.getState().status).toBe('needs_username');
    expect(router.dismissTo).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("shows the format rule when the server rejects the name's format (23514)", async () => {
    mockFake!.failNext('update', {
      message: 'new row for relation "profiles" violates check constraint "profiles_username_format"',
      code: '23514',
    });
    render(<UsernameScreen />);
    type(usernameField(), 'ana');
    await pressDone();

    expect(screen.getByRole('alert')).toHaveTextContent('Only letters, numbers, _ and .');
    expect(useAuthStore.getState().status).toBe('needs_username');
  });

  it("shows 'Couldn't save. Try again.' offline (postgrest answers a fetch error, code '')", async () => {
    mockFake!.failNext('update', { message: 'TypeError: Network request failed', code: '' });
    render(<UsernameScreen />);
    type(usernameField(), 'ana');
    await pressDone();

    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't save. Try again.");
    expect(screen.queryByText(/Network request failed/)).toBeNull();
  });

  it("reports a taken username (23505) in place as 'That username is taken' and stays", async () => {
    mockFake!.failNext('update', {
      message: 'duplicate key value violates unique constraint "profiles_username_key"',
      code: '23505',
    });
    render(<UsernameScreen />);
    type(usernameField(), 'ana');
    await pressDone();

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('That username is taken');
    expect(screen.queryByText(/duplicate key/)).toBeNull();
    expect(useAuthStore.getState().status).toBe('needs_username');
    expect(router.dismissTo).not.toHaveBeenCalled();
    // The rider can pick another and try again.
    expect(doneButton()).not.toBeDisabled();
  });

  it('clears the taken message once the rider edits the name', async () => {
    mockFake!.failNext('update', { message: 'duplicate key', code: '23505' });
    render(<UsernameScreen />);
    type(usernameField(), 'ana');
    await pressDone();
    expect(screen.getByText('That username is taken')).toBeTruthy();

    type(usernameField(), 'ana2');
    expect(screen.queryByText('That username is taken')).toBeNull();
  });

  it("shows 'Couldn't save. Try again.' for any other error, never its message", async () => {
    mockFake!.failNext('update', { message: 'permission denied for table profiles', code: '42501' });
    render(<UsernameScreen />);
    type(usernameField(), 'ana');
    await pressDone();

    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't save. Try again.");
    expect(screen.queryByText(/permission denied/)).toBeNull();
    expect(useAuthStore.getState().status).toBe('needs_username');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("shows 'Couldn't save. Try again.' when the request throws", async () => {
    mockFake!.from.mockImplementationOnce(() => {
      throw new TypeError('Network request failed');
    });
    render(<UsernameScreen />);
    type(usernameField(), 'ana');
    await pressDone();

    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't save. Try again.");
    expect(doneButton()).not.toBeDisabled();
  });

  it("shows 'Saving…' and saves once when Done is pressed twice", async () => {
    mockFake!.queryDelayMs = 50;
    jest.useFakeTimers();
    try {
      render(<UsernameScreen />);
      type(usernameField(), 'ana');
      await act(async () => {
        fireEvent.press(doneButton());
        fireEvent.press(doneButton());
      });
      expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
      await act(async () => {
        await jest.advanceTimersByTimeAsync(50);
      });
      expect(mockFake!.from).toHaveBeenCalledTimes(1);
      expect(router.dismissTo).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("goes on to the display name from the username's return key, without saving", async () => {
    render(<UsernameScreen />);
    const displayName = screen.UNSAFE_getAllByType(TextInput).find((n) => n.props.accessibilityLabel === 'Display name');
    const focus = jest.spyOn(displayName!.instance as { focus: () => void }, 'focus');
    type(usernameField(), 'ana');
    expect(usernameField().props.returnKeyType).toBe('next');
    await act(async () => {
      fireEvent(usernameField(), 'submitEditing');
    });
    expect(mockFake!.from).not.toHaveBeenCalled();
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it("saves from the display name's return key only when the username is valid", async () => {
    render(<UsernameScreen />);
    type(usernameField(), 'ab');
    await act(async () => {
      fireEvent(displayNameField(), 'submitEditing');
    });
    expect(mockFake!.from).not.toHaveBeenCalled();

    type(usernameField(), 'ana');
    await act(async () => {
      fireEvent(displayNameField(), 'submitEditing');
    });
    expect(mockFake!.from).toHaveBeenCalledTimes(1);
  });

  it('sends the rider back to Profile to sign in when there is no account (signed out, or a stray link)', () => {
    useAuthStore.setState({ ...SIGNED_OUT });
    render(<UsernameScreen />);
    expect(screen.queryByLabelText('Username')).toBeNull();
    expect(screen.getByText('Signed out. Sign in again from Profile.')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Back to Profile' }));
    expect(router.dismissTo).toHaveBeenCalledWith('/(tabs)/profile');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('replaces itself with the tabs when it is the only screen and there is no account', () => {
    // Redirected here at launch, then signed out: a replace with Sign in would leave a stack with no tabs, and the
    // code screen's dismissAll would have nothing to go back to.
    useAuthStore.setState({ ...SIGNED_OUT });
    router.canDismiss.mockReturnValue(false);
    render(<UsernameScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Back to Profile' }));
    expect(router.replace).toHaveBeenCalledWith('/(tabs)/profile');
    expect(router.dismissTo).not.toHaveBeenCalled();
  });

  it('lets the rider sign out instead of picking a username', async () => {
    render(<UsernameScreen />);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    });
    expect(mockFake!.auth.signOut).toHaveBeenCalledTimes(1);
    expect(mockFake!.from).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject(SIGNED_OUT);
    expect(router.dismissTo).toHaveBeenCalledWith('/(tabs)/profile');
  });

  it('signs out from the only screen (redirected at launch) by replacing it with the tabs', async () => {
    router.canDismiss.mockReturnValue(false);
    render(<UsernameScreen />);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    });
    expect(useAuthStore.getState()).toMatchObject(SIGNED_OUT);
    expect(router.replace).toHaveBeenCalledWith('/(tabs)/profile');
  });

  it('signs out once while a sign out is in flight, and not while saving', async () => {
    let finish!: () => void;
    mockFake!.auth.signOut.mockImplementationOnce(
      () => new Promise((resolve) => {
        finish = () => resolve({ error: null });
      }),
    );
    render(<UsernameScreen />);
    act(() => {
      fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
      fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    });
    expect(screen.getByRole('button', { name: 'Signing out…' })).toBeDisabled();
    expect(doneButton()).toBeDisabled();
    await act(async () => finish());
    expect(mockFake!.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it("shows only 'Accounts aren't set up in this build' when the client is unconfigured", () => {
    mockFake = null;
    render(<UsernameScreen />);
    expect(screen.getByText("Accounts aren't set up in this build")).toBeTruthy();
    expect(screen.queryByLabelText('Username')).toBeNull();
  });
});
