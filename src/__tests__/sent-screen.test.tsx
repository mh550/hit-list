// Profile → Sent (S7-05, docs/plans/2026-10-22-s7-send.md "Sent"): every send the rider made to a friend with its
// status, and Withdraw until it is saved. listSent and withdrawSend are sync-sends.test.ts's; here only the screen.
import React from 'react';
import { Alert, RefreshControl, type AlertButton } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useRouter } from 'expo-router';

import { createFakeSupabase, fakeSession, type FakeSupabase } from './helpers/fake-supabase';

let mockFake: FakeSupabase | null = null;
jest.mock('@/src/sync/client', () => ({
  getSupabase: () => mockFake,
  isConfigured: () => mockFake !== null,
}));
jest.mock('@/src/sync/sends', () => ({
  ...jest.requireActual('@/src/sync/sends'),
  listSent: jest.fn(),
  withdrawSend: jest.fn(),
}));

import SentScreen from '@/app/sent';
import { ACCOUNTS_NOT_SET_UP } from '@/src/components';
import { SIGNED_OUT, useAuthStore } from '@/src/stores/auth-store';
import { listSent, withdrawSend, type SentSend } from '@/src/sync/sends';

const ME = 'user-me';

const sent = (id: string, username: string | null, count: number, status: SentSend['status']): SentSend => ({
  id,
  to: { id: `id-${username ?? id}`, username, display_name: null },
  count,
  status,
  created_at: '2026-10-23T09:00:00.000Z',
  photoPaths: [`sends/${id}/photo.jpg`],
});

const BEN = sent('send-ben', 'ben', 3, 'waiting');
const ANA = sent('send-ana', 'ana', 1, 'saved');
const CAL = sent('send-cal', 'cal', 2, 'withdrawn');

let router: { push: jest.Mock };
let alert: jest.SpyInstance;
let warn: jest.SpyInstance;

function signIn(sends: SentSend[] = [BEN, ANA, CAL]) {
  mockFake?.setSession(fakeSession({ userId: ME }));
  useAuthStore.setState({ status: 'signed_in', userId: ME, email: 'me@example.com', username: 'me', displayName: null });
  jest.mocked(listSent).mockResolvedValue(sends);
}

async function renderScreen() {
  const view = render(<SentScreen />);
  await act(async () => {});
  return view;
}

function lastAlert(): { title: string; message?: string; buttons: AlertButton[] } {
  const call = alert.mock.calls.at(-1) ?? [];
  return { title: call[0], message: call[1], buttons: (call[2] ?? []) as AlertButton[] };
}

async function confirmWithdraw(name = 'Withdraw the spots sent to @ben') {
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name }));
  });
  const button = lastAlert().buttons.find((b) => b.text === 'Withdraw');
  if (!button) throw new Error('no Withdraw in the alert');
  await act(async () => {
    button.onPress?.();
  });
}

beforeEach(() => {
  mockFake = createFakeSupabase();
  useAuthStore.setState(SIGNED_OUT);
  router = { push: jest.fn() };
  jest.mocked(useRouter).mockReturnValue(router as never);
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.mocked(listSent).mockReset().mockResolvedValue([]);
  jest.mocked(withdrawSend).mockReset().mockResolvedValue('withdrawn');
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Sent screen', () => {
  it("signed out shows 'Sign in to see what you sent' and Sign in", async () => {
    await renderScreen();

    expect(screen.getByText('Sign in to see what you sent')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(router.push).toHaveBeenCalledWith('/auth/sign-in');
    expect(listSent).not.toHaveBeenCalled();
  });

  it("an unconfigured build says accounts aren't set up", async () => {
    mockFake = null;
    await renderScreen();

    expect(screen.getByText(ACCOUNTS_NOT_SET_UP)).toBeOnTheScreen();
  });

  it('lists every send with its friend, count and status; only Waiting has Withdraw, Saved has the hint', async () => {
    signIn();
    await renderScreen();

    expect(listSent).toHaveBeenCalledWith(expect.anything(), mockFake, ME);
    expect(screen.getByText('To @ben · 3 spots · Waiting')).toBeOnTheScreen();
    expect(screen.getByText('To @ana · 1 spot · Saved')).toBeOnTheScreen();
    expect(screen.getByText('Saved copies are theirs')).toBeOnTheScreen();
    expect(screen.getByText('To @cal · 2 spots · Withdrawn')).toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: /^Withdraw/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Withdraw the spots sent to @ben' })).toBeOnTheScreen();
  });

  it("a friend without a readable name reads 'To a rider'", async () => {
    signIn([sent('send-x', null, 2, 'waiting')]);
    await renderScreen();

    expect(screen.getByText('To a rider · 2 spots · Waiting')).toBeOnTheScreen();
  });

  it("with nothing sent shows 'Nothing sent yet'", async () => {
    signIn([]);
    await renderScreen();

    expect(screen.getByText('Nothing sent yet')).toBeOnTheScreen();
  });

  it("a failed first load reads \"Couldn't reach the server. Pull to try again.\"", async () => {
    signIn();
    jest.mocked(listSent).mockRejectedValue(new Error('offline'));
    await renderScreen();

    expect(screen.getByText("Couldn't reach the server. Pull to try again.")).toBeOnTheScreen();
    expect(screen.queryByText('Nothing sent yet')).toBeNull();
  });

  it("Withdraw confirms ('They won't get these spots.') and calls withdrawSend; the row reads Withdrawn", async () => {
    signIn();
    await renderScreen();
    jest.mocked(listSent).mockClear();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Withdraw the spots sent to @ben' }));
    });
    expect(lastAlert()).toMatchObject({ title: 'Withdraw these spots?', message: "They won't get these spots." });
    expect(lastAlert().buttons.map((b) => b.text)).toEqual(['Cancel', 'Withdraw']);
    expect(withdrawSend).not.toHaveBeenCalled();
    await act(async () => {
      lastAlert().buttons.find((b) => b.text === 'Withdraw')!.onPress?.();
    });

    expect(withdrawSend).toHaveBeenCalledWith(mockFake, ME, BEN);
    expect(screen.getByText('To @ben · 3 spots · Withdrawn')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Withdraw/ })).toBeNull();
    // and it reads the list again
    expect(listSent).toHaveBeenCalled();
  });

  it('Cancel on the confirm withdraws nothing', async () => {
    signIn();
    await renderScreen();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Withdraw the spots sent to @ben' }));
    });
    await act(async () => {
      lastAlert().buttons.find((b) => b.text === 'Cancel')!.onPress?.();
    });

    expect(withdrawSend).not.toHaveBeenCalled();
    expect(screen.getByText('To @ben · 3 spots · Waiting')).toBeOnTheScreen();
  });

  it("a send saved first (55000) reads Saved and says 'They already saved these.'", async () => {
    signIn();
    jest.mocked(withdrawSend).mockResolvedValue('saved');
    await renderScreen();

    await confirmWithdraw();

    expect(screen.getByText('To @ben · 3 spots · Saved')).toBeOnTheScreen();
    expect(alert).toHaveBeenLastCalledWith('They already saved these.');
  });

  it("a failed withdraw warns, alerts \"Couldn't reach the server\" and keeps the row Waiting", async () => {
    signIn();
    jest.mocked(withdrawSend).mockRejectedValue(new Error('offline'));
    await renderScreen();

    await confirmWithdraw();

    expect(alert).toHaveBeenLastCalledWith("Couldn't reach the server", 'Try again.');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[Sent]'), 'offline');
    expect(screen.getByText('To @ben · 3 spots · Waiting')).toBeOnTheScreen();
  });

  it('a double tap on the confirm sends one withdraw, and the row shows a spinner meanwhile', async () => {
    signIn();
    let finish: () => void = () => {};
    jest.mocked(withdrawSend).mockImplementation(() => new Promise((resolve) => (finish = () => resolve('withdrawn'))));
    await renderScreen();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Withdraw the spots sent to @ben' }));
    });
    const confirm = lastAlert().buttons.find((b) => b.text === 'Withdraw')!;
    await act(async () => {
      confirm.onPress?.();
      confirm.onPress?.();
    });
    expect(screen.getByLabelText('Withdrawing')).toBeOnTheScreen();
    await act(async () => finish());

    expect(withdrawSend).toHaveBeenCalledTimes(1);
  });

  it('pull to refresh reads the list again', async () => {
    signIn([BEN]);
    await renderScreen();
    jest.mocked(listSent).mockResolvedValue([{ ...BEN, status: 'saved' }]);

    await act(async () => {
      await screen.UNSAFE_getByType(RefreshControl).props.onRefresh();
    });

    expect(screen.getByText('To @ben · 3 spots · Saved')).toBeOnTheScreen();
  });
});
