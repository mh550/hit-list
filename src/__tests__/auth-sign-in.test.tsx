// The sign-in screen (S4-03): an email field and 'Send code' (signInWithOtp), then the code screen.
// The client is the hand-written fake (helpers/fake-supabase.ts); null = a build without Supabase values.
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { useRouter } from 'expo-router';
import { AuthRetryableFetchError, AuthUnknownError } from '@supabase/supabase-js';

import { createFakeSupabase, type FakeSupabase } from './helpers/fake-supabase';

let mockFake: FakeSupabase | null = null;
jest.mock('@/src/sync/client', () => ({
  getSupabase: () => mockFake,
  isConfigured: () => mockFake !== null,
}));

import SignInScreen from '@/app/auth/sign-in';

let push: jest.Mock;

beforeEach(() => {
  mockFake = createFakeSupabase();
  push = jest.fn();
  jest.mocked(useRouter).mockReturnValue({ push, back: jest.fn(), replace: jest.fn(), dismissAll: jest.fn() } as never);
});

const sendButton = () => screen.getByRole('button', { name: 'Send code' });

describe('SignInScreen', () => {
  it('shows the heading, the explanation and an email field', () => {
    render(<SignInScreen />);
    expect(screen.getByText('Sign in to HitList')).toBeTruthy();
    expect(screen.getByText("We'll email you a 6-digit code. No password.")).toBeTruthy();
    const email = screen.getByLabelText('Email');
    expect(email.props.keyboardType).toBe('email-address');
    expect(email.props.autoCapitalize).toBe('none');
  });

  it("keeps 'Send code' disabled until the text contains '@'", () => {
    render(<SignInScreen />);
    expect(sendButton()).toBeDisabled();
    fireEvent.changeText(screen.getByLabelText('Email'), 'ana');
    expect(sendButton()).toBeDisabled();
    fireEvent.changeText(screen.getByLabelText('Email'), 'ana@example.com');
    expect(sendButton()).toBeEnabled();
  });

  it('sends the code and opens the code screen with the email', async () => {
    render(<SignInScreen />);
    fireEvent.changeText(screen.getByLabelText('Email'), 'ana@example.com');
    await act(async () => {
      fireEvent.press(sendButton());
    });
    expect(mockFake!.auth.signInWithOtp).toHaveBeenCalledTimes(1);
    expect(mockFake!.auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'ana@example.com',
      options: { shouldCreateUser: true },
    });
    expect(push).toHaveBeenCalledWith({ pathname: '/auth/code', params: { email: 'ana@example.com' } });
  });

  it('sends the email trimmed and lowercased, as riders type it', async () => {
    render(<SignInScreen />);
    fireEvent.changeText(screen.getByLabelText('Email'), '  Ana@Example.COM ');
    await act(async () => {
      fireEvent.press(sendButton());
    });
    expect(mockFake!.auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'ana@example.com',
      options: { shouldCreateUser: true },
    });
    expect(push).toHaveBeenCalledWith({ pathname: '/auth/code', params: { email: 'ana@example.com' } });
  });

  it('shows an error message in place and stays on the screen', async () => {
    mockFake!.failNext('signInWithOtp', { message: 'Email rate limit exceeded', status: 429, code: 'over_email_send_rate_limit' });
    render(<SignInScreen />);
    fireEvent.changeText(screen.getByLabelText('Email'), 'ana@example.com');
    await act(async () => {
      fireEvent.press(sendButton());
    });
    const alert = screen.getByRole('alert');
    // The message only, never the whole error object.
    expect(alert).toHaveTextContent('Email rate limit exceeded', { exact: true });
    expect(push).not.toHaveBeenCalled();
    expect(sendButton()).toBeEnabled();
  });

  it("shows 'Sending…' and sends once while the request is in flight", async () => {
    let finish!: () => void;
    mockFake!.auth.signInWithOtp.mockImplementationOnce(
      () => new Promise((resolve) => {
        finish = () => resolve({ data: { user: null, session: null }, error: null });
      }),
    );
    render(<SignInScreen />);
    fireEvent.changeText(screen.getByLabelText('Email'), 'ana@example.com');
    act(() => {
      // The return key lands before the disabled state renders.
      fireEvent.press(sendButton());
      fireEvent(screen.getByLabelText('Email'), 'submitEditing');
    });
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
    await act(async () => finish());
    expect(mockFake!.auth.signInWithOtp).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('does not open the code screen when the rider closed sign-in while the code was sending', async () => {
    let finish!: () => void;
    mockFake!.auth.signInWithOtp.mockImplementationOnce(
      () => new Promise((resolve) => {
        finish = () => resolve({ data: { user: null, session: null }, error: null });
      }),
    );
    const { unmount } = render(<SignInScreen />);
    fireEvent.changeText(screen.getByLabelText('Email'), 'ana@example.com');
    fireEvent.press(sendButton());
    unmount();
    await act(async () => finish());
    expect(push).not.toHaveBeenCalled();
  });

  it("shows fixed copy, not auth-js's text, when the phone is offline", async () => {
    mockFake!.auth.signInWithOtp.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: new AuthRetryableFetchError('Network request failed', 0),
    } as never);
    render(<SignInScreen />);
    fireEvent.changeText(screen.getByLabelText('Email'), 'ana@example.com');
    await act(async () => {
      fireEvent.press(sendButton());
    });
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't send the code. Check your connection and try again.", {
      exact: true,
    });
  });

  it.each([
    ['a JSON body auth-js could not read a message from', { message: '{"code":500,"detail":"smtp"}', status: 500 }],
    ['an empty message', { message: '', status: 500 }],
  ])("shows fixed copy, not the server's text, for %s", async (_case, error) => {
    mockFake!.failNext('signInWithOtp', error);
    render(<SignInScreen />);
    fireEvent.changeText(screen.getByLabelText('Email'), 'ana@example.com');
    await act(async () => {
      fireEvent.press(sendButton());
    });
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't send the code. Check your connection and try again.", {
      exact: true,
    });
  });

  it("shows fixed copy for auth-js's unknown error (a reply that wasn't JSON, e.g. a captive portal page)", async () => {
    mockFake!.auth.signInWithOtp.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: new AuthUnknownError('Unexpected token < in JSON at position 0', new SyntaxError('Unexpected token <')),
    } as never);
    render(<SignInScreen />);
    fireEvent.changeText(screen.getByLabelText('Email'), 'ana@example.com');
    await act(async () => {
      fireEvent.press(sendButton());
    });
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't send the code. Check your connection and try again.", {
      exact: true,
    });
  });

  it('announces an error to VoiceOver', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    mockFake!.failNext('signInWithOtp', { message: 'Email rate limit exceeded', status: 429 });
    render(<SignInScreen />);
    fireEvent.changeText(screen.getByLabelText('Email'), 'ana@example.com');
    await act(async () => {
      fireEvent.press(sendButton());
    });
    expect(announce).toHaveBeenCalledWith('Email rate limit exceeded');
    announce.mockRestore();
  });

  it("shows only 'Accounts aren't set up in this build' when the client is unconfigured", () => {
    mockFake = null;
    render(<SignInScreen />);
    expect(screen.getByText("Accounts aren't set up in this build")).toBeTruthy();
    expect(screen.queryByText('Sign in to HitList')).toBeNull();
    expect(screen.queryByLabelText('Email')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
