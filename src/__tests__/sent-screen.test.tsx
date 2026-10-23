// Profile → Sent (S7-05, docs/plans/2026-10-22-s7-send.md "Sent"): every send the rider made to a friend with its
// status, and Withdraw until it is saved; below them the send links (S9-03) with Revoke while active. listSent,
// withdrawSend, listSentLinks and revokeSentLink are sync-sends.test.ts's; here only the screen.
import { readFileSync } from 'fs';
import { join } from 'path';
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
  listSentLinks: jest.fn(),
  revokeSentLink: jest.fn(),
}));

import SentScreen from '@/app/sent';
import { ACCOUNTS_NOT_SET_UP } from '@/src/components';
import { SIGNED_OUT, useAuthStore } from '@/src/stores/auth-store';
import {
  listSent,
  listSentLinks,
  revokeSentLink,
  withdrawSend,
  type SentLink,
  type SentSend,
} from '@/src/sync/sends';

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

const sentLink = (id: string, count: number, status: SentLink['status'], expiresAt: string | null): SentLink => ({
  id,
  sendId: `send-${id}`,
  count,
  status,
  createdAt: '2026-10-22T09:00:00.000Z',
  expiresAt,
  photoPaths: [`sends/send-${id}/photo.jpg`],
});

const ACTIVE = sentLink('link-active', 3, 'active', '2026-11-21T12:00:00.000Z');
const NEVER = sentLink('link-never', 1, 'active', null);
const EXPIRED = sentLink('link-expired', 2, 'expired', '2026-10-20T12:00:00.000Z');
const REVOKED = sentLink('link-revoked', 5, 'revoked', '2026-11-30T12:00:00.000Z');

let router: { push: jest.Mock };
let alert: jest.SpyInstance;
let warn: jest.SpyInstance;

function signIn(sends: SentSend[] = [BEN, ANA, CAL], links: SentLink[] = []) {
  mockFake?.setSession(fakeSession({ userId: ME }));
  useAuthStore.setState({ status: 'signed_in', userId: ME, email: 'me@example.com', username: 'me', displayName: null });
  jest.mocked(listSent).mockResolvedValue(sends);
  jest.mocked(listSentLinks).mockResolvedValue(links);
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

async function confirmRevoke(name = 'Revoke the link to 3 spots') {
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name }));
  });
  const button = lastAlert().buttons.find((b) => b.text === 'Revoke');
  if (!button) throw new Error('no Revoke in the alert');
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
  jest.mocked(listSentLinks).mockReset().mockResolvedValue([]);
  jest.mocked(revokeSentLink).mockReset().mockResolvedValue(true);
});

afterEach(async () => {
  // FlatList renders its cells on a 50 ms batch timer after a data change; let it fire inside act (a loaded machine
  // reaches it before the cleanup unmounts the list)
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
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
    expect(screen.queryByRole('button', { name: /^Withdraw/ })).toBeNull();
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

  it('a withdraw that finds no session (signed out meanwhile) alerts nothing and keeps the row Waiting', async () => {
    signIn();
    jest.mocked(withdrawSend).mockResolvedValue(null);
    await renderScreen();

    await confirmWithdraw();

    expect(alert).toHaveBeenCalledTimes(1); // the confirm only
    expect(screen.getByText('To @ben · 3 spots · Waiting')).toBeOnTheScreen();
  });

  it("the re-read after a Withdraw doesn't show the pull-to-refresh spinner", async () => {
    signIn();
    await renderScreen();
    jest.mocked(listSent).mockImplementation(() => new Promise(() => {}));

    await confirmWithdraw();

    expect(listSent).toHaveBeenCalledTimes(2);
    expect(screen.UNSAFE_getByType(RefreshControl).props.refreshing).toBe(false);
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

  describe('Links', () => {
    it("lists the send links below the friend sends, newest first as read: 'Active until Nov 21', 'Active', 'Expired', 'Revoked'", async () => {
      signIn([BEN], [ACTIVE, NEVER, EXPIRED, REVOKED]);
      await renderScreen();

      expect(listSentLinks).toHaveBeenCalledWith(mockFake, ME);
      expect(screen.getByText('Links')).toBeOnTheScreen();
      expect(screen.getAllByText(/^(To|Link) · |^To @/).map((t) => t.props.children)).toEqual([
        'To @ben · 3 spots · Waiting',
        'Link · 3 spots · Active until Nov 21',
        'Link · 1 spot · Active',
        'Link · 2 spots · Expired',
        'Link · 5 spots · Revoked',
      ]);
    });

    it('only Active links have Revoke; Expired and Revoked have none', async () => {
      signIn([], [ACTIVE, NEVER, EXPIRED, REVOKED]);
      await renderScreen();

      expect(screen.getAllByRole('button', { name: /^Revoke/ }).map((b) => b.props.accessibilityLabel)).toEqual([
        'Revoke the link to 3 spots',
        'Revoke the link to 1 spot',
      ]);
    });

    it("with only links sent, shows them and not 'Nothing sent yet'", async () => {
      signIn([], [EXPIRED]);
      await renderScreen();

      expect(screen.getByText('Link · 2 spots · Expired')).toBeOnTheScreen();
      expect(screen.queryByText('Nothing sent yet')).toBeNull();
    });

    it("a failed links load still shows the friend sends, under \"Couldn't reach the server. Pull to try again.\"", async () => {
      signIn([BEN]);
      jest.mocked(listSentLinks).mockRejectedValue(new Error('offline'));
      await renderScreen();

      expect(screen.getByText("Couldn't reach the server. Pull to try again.")).toBeOnTheScreen();
      expect(screen.getByText('To @ben · 3 spots · Waiting')).toBeOnTheScreen();
      expect(screen.queryByText('Links')).toBeNull();
    });

    it('with no links there is no Links section', async () => {
      signIn([BEN], []);
      await renderScreen();

      expect(screen.queryByText('Links')).toBeNull();
    });

    it("Revoke confirms ('The link stops working now.') and only then calls revokeSentLink; the row reads Revoked", async () => {
      signIn([], [ACTIVE]);
      await renderScreen();
      jest.mocked(listSentLinks).mockClear();

      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: 'Revoke the link to 3 spots' }));
      });
      expect(lastAlert()).toMatchObject({ title: 'Revoke this link?', message: 'The link stops working now.' });
      expect(lastAlert().buttons.map((b) => [b.text, b.style])).toEqual([
        ['Cancel', 'cancel'],
        ['Revoke', 'destructive'],
      ]);
      expect(revokeSentLink).not.toHaveBeenCalled();
      await act(async () => {
        lastAlert().buttons.find((b) => b.text === 'Revoke')!.onPress?.();
      });

      expect(revokeSentLink).toHaveBeenCalledWith(mockFake, ME, ACTIVE);
      expect(screen.getByText('Link · 3 spots · Revoked')).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: /^Revoke/ })).toBeNull();
      // and it reads the links again
      expect(listSentLinks).toHaveBeenCalled();
    });

    it('Cancel on the confirm revokes nothing', async () => {
      signIn([], [ACTIVE]);
      await renderScreen();

      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: 'Revoke the link to 3 spots' }));
      });
      await act(async () => {
        lastAlert().buttons.find((b) => b.text === 'Cancel')!.onPress?.();
      });

      expect(revokeSentLink).not.toHaveBeenCalled();
      expect(screen.getByText('Link · 3 spots · Active until Nov 21')).toBeOnTheScreen();
    });

    it("a failed revoke warns, alerts \"Couldn't reach the server\" and keeps the row Active", async () => {
      signIn([], [ACTIVE]);
      jest.mocked(revokeSentLink).mockRejectedValue(new Error('offline'));
      await renderScreen();

      await confirmRevoke();

      expect(alert).toHaveBeenLastCalledWith("Couldn't reach the server", 'Try again.');
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('[Sent]'), 'offline');
      expect(screen.getByText('Link · 3 spots · Active until Nov 21')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Revoke the link to 3 spots' })).toBeOnTheScreen();
    });

    it('a revoke that withdrew the send but failed on the link re-reads the links, which then read Revoked', async () => {
      signIn([], [ACTIVE]);
      jest.mocked(revokeSentLink).mockRejectedValue(new Error('offline'));
      await renderScreen();
      jest.mocked(listSentLinks).mockResolvedValue([{ ...ACTIVE, status: 'revoked' }]);

      await confirmRevoke();

      expect(await screen.findByText('Link · 3 spots · Revoked')).toBeOnTheScreen();
    });

    it('a revoke that finds no session (signed out meanwhile) alerts nothing and keeps the row Active', async () => {
      signIn([], [ACTIVE]);
      jest.mocked(revokeSentLink).mockResolvedValue(null);
      await renderScreen();

      await confirmRevoke();

      expect(alert).toHaveBeenCalledTimes(1); // the confirm only
      expect(screen.getByText('Link · 3 spots · Active until Nov 21')).toBeOnTheScreen();
    });

    it('a double tap on the confirm sends one revoke, and the row shows a spinner meanwhile', async () => {
      signIn([], [ACTIVE]);
      let finish: () => void = () => {};
      jest.mocked(revokeSentLink).mockImplementation(() => new Promise((resolve) => (finish = () => resolve(true))));
      await renderScreen();

      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: 'Revoke the link to 3 spots' }));
      });
      const confirm = lastAlert().buttons.find((b) => b.text === 'Revoke')!;
      await act(async () => {
        confirm.onPress?.();
        confirm.onPress?.();
      });
      expect(screen.getByLabelText('Revoking')).toBeOnTheScreen();
      await act(async () => finish());

      expect(revokeSentLink).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Link · 3 spots · Revoked')).toBeOnTheScreen();
    });

    it('the screen never says Share', async () => {
      signIn([BEN], [ACTIVE, EXPIRED]);
      await renderScreen();

      expect(screen.queryByText(/share/i)).toBeNull();
      const source = readFileSync(join(__dirname, '../../app/sent/index.tsx'), 'utf8');
      expect(source).not.toMatch(/share/i);
    });
  });
});
