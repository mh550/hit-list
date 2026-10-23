// The code screen (S4-03): six digits auto-submit verifyOtp once; errors show in place; 'Resend code';
// success resolves the account and goes to the username screen or back to where sign-in was opened.
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { createFakeSupabase, type FakeSupabase } from './helpers/fake-supabase';

let mockFake: FakeSupabase | null = null;
jest.mock('@/src/sync/client', () => ({
  getSupabase: () => mockFake,
  isConfigured: () => mockFake !== null,
}));

import CodeScreen from '@/app/auth/code';
import { SIGNED_OUT, useAuthStore } from '@/src/stores/auth-store';

let router: { push: jest.Mock; back: jest.Mock; replace: jest.Mock; dismissAll: jest.Mock };

beforeEach(() => {
  mockFake = createFakeSupabase({ userId: 'user-ana' });
  useAuthStore.setState({ ...SIGNED_OUT });
  router = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissAll: jest.fn() };
  jest.mocked(useRouter).mockReturnValue(router as never);
  jest.mocked(useLocalSearchParams).mockReturnValue({ email: 'ana@example.com' });
});

afterEach(() => {
  jest.useRealTimers();
  jest.mocked(useLocalSearchParams).mockReturnValue({});
});

const codeField = () => screen.getByLabelText('Code');

async function typeCode(text: string) {
  await act(async () => {
    fireEvent.changeText(codeField(), text);
  });
}

describe('CodeScreen', () => {
  it('names the email and shows a 6-digit number field', () => {
    render(<CodeScreen />);
    expect(screen.getByText('Enter the code we sent to ana@example.com')).toBeTruthy();
    expect(codeField().props.keyboardType).toBe('number-pad');
    expect(codeField().props.maxLength).toBe(6);
    expect(codeField().props.textContentType).toBe('oneTimeCode');
  });

  it('auto-submits six digits once with verifyOtp', async () => {
    mockFake!.profiles.set('user-ana', { username: 'ana', display_name: 'Ana B' });
    render(<CodeScreen />);
    await typeCode('12345');
    expect(mockFake!.auth.verifyOtp).not.toHaveBeenCalled();
    await typeCode('123456');
    expect(mockFake!.auth.verifyOtp).toHaveBeenCalledTimes(1);
    expect(mockFake!.auth.verifyOtp).toHaveBeenCalledWith({ email: 'ana@example.com', token: '123456', type: 'email' });
  });

  it('keeps digits only, so a pasted "123 456" verifies once as 123456', async () => {
    mockFake!.profiles.set('user-ana', { username: 'ana', display_name: null });
    render(<CodeScreen />);
    await typeCode('123 456');
    expect(mockFake!.auth.verifyOtp).toHaveBeenCalledTimes(1);
    expect(mockFake!.auth.verifyOtp).toHaveBeenCalledWith({ email: 'ana@example.com', token: '123456', type: 'email' });
  });

  it('does not verify again on a re-render or the same six digits while one is in flight', async () => {
    let finish!: () => void;
    mockFake!.auth.verifyOtp.mockImplementationOnce(
      () => new Promise((resolve) => {
        finish = () => resolve({ data: { user: null, session: null }, error: { message: 'Token has expired or is invalid' } });
      }),
    );
    const { rerender } = render(<CodeScreen />);
    await typeCode('123456');
    expect(screen.getByText('Checking…')).toBeTruthy();
    rerender(<CodeScreen />);
    await typeCode('123456');
    expect(mockFake!.auth.verifyOtp).toHaveBeenCalledTimes(1);
    await act(async () => finish());
  });

  it('verifies once when a second six lands before the field is disabled', async () => {
    mockFake!.profiles.set('user-ana', { username: 'ana', display_name: null });
    render(<CodeScreen />);
    const { onChangeText } = codeField().props;
    await act(async () => {
      onChangeText('123456');
      onChangeText('123456');
    });
    expect(mockFake!.auth.verifyOtp).toHaveBeenCalledTimes(1);
    expect(router.dismissAll).toHaveBeenCalledTimes(1);
  });

  it("shows 'That code didn't work. Try again or resend.' on an error and clears the field", async () => {
    mockFake!.failNext('verifyOtp', { message: 'Token has expired or is invalid', status: 403, code: 'otp_expired' });
    render(<CodeScreen />);
    await typeCode('123456');
    expect(screen.getByRole('alert')).toHaveTextContent("That code didn't work. Try again or resend.", { exact: true });
    expect(codeField().props.value).toBe('');
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.dismissAll).not.toHaveBeenCalled();
    // A second try verifies again.
    mockFake!.profiles.set('user-ana', { username: 'ana', display_name: null });
    await typeCode('654321');
    expect(mockFake!.auth.verifyOtp).toHaveBeenCalledTimes(2);
    expect(mockFake!.auth.verifyOtp).toHaveBeenLastCalledWith({ email: 'ana@example.com', token: '654321', type: 'email' });
  });

  it("'Resend code' calls signInWithOtp again and shows 'Sent' for a moment", async () => {
    jest.useFakeTimers();
    render(<CodeScreen />);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Resend code' }));
    });
    expect(mockFake!.auth.signInWithOtp).toHaveBeenCalledTimes(1);
    expect(mockFake!.auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'ana@example.com',
      options: { shouldCreateUser: true },
    });
    expect(screen.getByText('Sent')).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(screen.queryByText('Sent')).toBeNull();
    expect(screen.getByRole('button', { name: 'Resend code' })).toBeTruthy();
  });

  it("shows a resend error's message only", async () => {
    mockFake!.failNext('signInWithOtp', { message: 'Email rate limit exceeded', status: 429 });
    render(<CodeScreen />);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Resend code' }));
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Email rate limit exceeded', { exact: true });
    expect(screen.queryByText('Sent')).toBeNull();
  });

  it("'Use a different email' goes back", () => {
    render(<CodeScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Use a different email' }));
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('a verified account without a username replaces the route with /auth/username', async () => {
    mockFake!.profiles.set('user-ana', { username: null, display_name: null });
    render(<CodeScreen />);
    await typeCode('123456');
    expect(router.replace).toHaveBeenCalledWith('/auth/username');
    expect(router.dismissAll).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({ status: 'needs_username', userId: 'user-ana', email: 'ana@example.com' });
  });

  it('a verified account with a username dismisses back to the tab that opened sign-in', async () => {
    mockFake!.profiles.set('user-ana', { username: 'ana', display_name: 'Ana B' });
    render(<CodeScreen />);
    await typeCode('123456');
    expect(router.dismissAll).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({
      status: 'signed_in',
      userId: 'user-ana',
      username: 'ana',
      displayName: 'Ana B',
    });
  });

  it('keeps the field editable while checking, so the keyboard stays up after a wrong code', async () => {
    let finish!: () => void;
    mockFake!.auth.verifyOtp.mockImplementationOnce(
      () => new Promise((resolve) => {
        finish = () => resolve({ data: { user: null, session: null }, error: { message: 'Token has expired or is invalid' } });
      }),
    );
    render(<CodeScreen />);
    await typeCode('123456');
    expect(codeField().props.editable).not.toBe(false);
    // Typing while one is in flight never verifies a second time.
    await typeCode('654321');
    expect(mockFake!.auth.verifyOtp).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    expect(screen.getByRole('alert')).toHaveTextContent("That code didn't work. Try again or resend.");
  });

  it("treats a verifyOtp that throws as a code that didn't work", async () => {
    mockFake!.auth.verifyOtp.mockRejectedValueOnce(new Error('boom'));
    render(<CodeScreen />);
    await typeCode('123456');
    expect(screen.getByRole('alert')).toHaveTextContent("That code didn't work. Try again or resend.", { exact: true });
    expect(router.dismissAll).not.toHaveBeenCalled();
  });

  it('with no email to check sends nothing and offers the way back to Sign in', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({});
    render(<CodeScreen />);
    expect(screen.queryByLabelText('Code')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Resend code' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Back to Sign in' }));
    expect(router.replace).toHaveBeenCalledWith('/auth/sign-in');
    expect(mockFake!.auth.signInWithOtp).not.toHaveBeenCalled();
    expect(mockFake!.auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("shows only 'Accounts aren't set up in this build' when the client is unconfigured", () => {
    mockFake = null;
    render(<CodeScreen />);
    expect(screen.getByText("Accounts aren't set up in this build")).toBeTruthy();
    expect(screen.queryByLabelText('Code')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
