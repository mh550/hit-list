// The username screen (S4-04): after the first sign-in the rider picks an @username (required) and a display name
// (optional, D63). Live validation under the field, 'Done' only when valid, a taken name reported in place; success
// marks the account signed in and lands on the Profile tab.
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

let router: { push: jest.Mock; back: jest.Mock; replace: jest.Mock; dismissAll: jest.Mock };

beforeEach(() => {
  mockFake = createFakeSupabase({ userId: 'user-ana' });
  mockFake.profiles.set('user-ana', { username: null, display_name: null });
  useAuthStore.setState({
    ...SIGNED_OUT,
    status: 'needs_username',
    userId: 'user-ana',
    email: 'ana@example.com',
  });
  router = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissAll: jest.fn() };
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
    expect(screen.getByText('@')).toBeTruthy();
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

  it('marks the account signed in and replaces the route with the Profile tab', async () => {
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
    expect(router.replace).toHaveBeenCalledWith('/(tabs)/profile');
    expect(router.back).not.toHaveBeenCalled();
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
    expect(router.replace).not.toHaveBeenCalled();
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

  it("shows 'Couldn't save. Try again.' when the request throws (offline)", async () => {
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
      expect(router.replace).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('submits from the keyboard return key only when valid', async () => {
    render(<UsernameScreen />);
    type(usernameField(), 'ab');
    await act(async () => {
      fireEvent(usernameField(), 'submitEditing');
    });
    expect(mockFake!.from).not.toHaveBeenCalled();

    type(usernameField(), 'ana');
    await act(async () => {
      fireEvent(displayNameField(), 'submitEditing');
    });
    expect(mockFake!.from).toHaveBeenCalledTimes(1);
  });

  it('asks to sign in first when there is no account (opened by a stray link)', () => {
    useAuthStore.setState({ ...SIGNED_OUT });
    render(<UsernameScreen />);
    expect(screen.queryByLabelText('Username')).toBeNull();
    expect(screen.getByText('Sign in first to pick a username.')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(router.replace).toHaveBeenCalledWith('/auth/sign-in');
  });

  it("shows only 'Accounts aren't set up in this build' when the client is unconfigured", () => {
    mockFake = null;
    render(<UsernameScreen />);
    expect(screen.getByText("Accounts aren't set up in this build")).toBeTruthy();
    expect(screen.queryByLabelText('Username')).toBeNull();
  });
});
