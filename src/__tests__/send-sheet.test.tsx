import { readFileSync } from 'fs';
import { join } from 'path';
import { AccessibilityInfo, ActivityIndicator, Image, Modal } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useSQLiteContext as sharedDb } from 'expo-sqlite';

import { createFakeSupabase, fakeSession, type FakeSupabase } from './helpers/fake-supabase';

let mockFake: FakeSupabase | null = null;
jest.mock('@/src/sync/client', () => ({
  getSupabase: () => mockFake,
  isConfigured: () => mockFake !== null,
}));
// The send itself is src/sync/sends.ts's (sync-sends.test.ts); here only what the sheet asks of it.
jest.mock('@/src/sync/sends', () => ({
  ...jest.requireActual('@/src/sync/sends'),
  createSend: jest.fn(),
  makeSendLink: jest.fn(),
}));
jest.mock('@/src/sync/engine', () => ({ syncNow: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/src/sync/friends', () => ({
  ...jest.requireActual('@/src/sync/friends'),
  refreshFriends: jest.fn().mockResolvedValue(undefined),
}));

import { ACCOUNTS_NOT_SET_UP } from '@/src/components';
import { SendSheet } from '@/src/components/SendSheet';
import { useMediaStore, useSpotsStore } from '@/src/stores';
import { SIGNED_OUT, useAuthStore, type AuthSnapshot } from '@/src/stores/auth-store';
import { EMPTY_FRIENDS, useFriendsStore } from '@/src/stores/friends-store';
import { clearToast, useToastStore } from '@/src/stores/toast-store';
import { syncNow } from '@/src/sync/engine';
import { refreshFriends, type FriendsData } from '@/src/sync/friends';
import { createSend, makeSendLink, NotBackedUpError, type SendResult } from '@/src/sync/sends';
import { resolvePhotoUri } from '@/src/utils/photo-storage';
import { createTestMedia, createTestSpot } from './factories';

const RIDER: AuthSnapshot = {
  status: 'signed_in',
  userId: 'user-me',
  email: 'me@example.com',
  username: 'me',
  displayName: 'Me Myself',
};

const profile = (id: string, username: string | null, display_name: string | null = null) => ({
  id,
  username,
  display_name,
});
const ANA = profile('id-ana', 'ana', 'Ana B');
const BEN = profile('id-ben', 'ben');
const CAL = profile('id-cal', 'cal');
const friendRow = (p: typeof ANA) => ({ friendshipId: `f-${p.id}`, created_at: '2026-10-20T10:00:00.000Z', profile: p });
const FRIENDS: FriendsData = { ...EMPTY_FRIENDS, friends: [ANA, BEN].map(friendRow) };

const D34_MANY = (n: number) =>
  `They get a copy of these ${n} spots as they are now. Changes you make later won't reach them.`;
const D34_ONE = "They get a copy of this spot as it is now. Changes you make later won't reach them.";
const NOT_BACKED_UP = "Some of these spots aren't backed up yet. Try again when you're online.";
const FAILED = "Couldn't send. Try again.";

const db = sharedDb();
let router: { push: jest.Mock };
let onClose: jest.Mock;
let warn: jest.SpyInstance;

const spotA = createTestSpot({ id: 'a', name: 'Alley rail', owner_id: 'user-me' });
const spotB = createTestSpot({ id: 'b', name: 'Bank', owner_id: 'user-me' });
const spotC = createTestSpot({ id: 'c', name: 'Church ledge', owner_id: 'user-me' });
const spotD = createTestSpot({ id: 'd', name: 'Dock gap', owner_id: 'user-me' });
const photo = (spotId: string) => createTestMedia({ id: `m-${spotId}`, spot_id: spotId, file_path: `photos/${spotId}/m.jpg` });

function signIn(data: FriendsData = FRIENDS) {
  mockFake?.setSession(fakeSession({ userId: 'user-me' }));
  useAuthStore.setState(RIDER);
  useFriendsStore.getState().applyFriends('user-me', data);
}

async function renderSheet(spotIds: string[] = ['a', 'b', 'c']) {
  render(<SendSheet spotIds={spotIds} onClose={onClose} />);
  await act(async () => {});
}

const friend = (handle: string) => screen.getByRole('checkbox', { name: handle });
const sendButton = () => screen.getByRole('button', { name: 'Send' });
const allText = () =>
  screen
    .queryAllByText(/./)
    .map((t) => [t.props.children].flat().join(''))
    .join('\n');

async function pressCopyLink() {
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Copy link' }));
  });
}

async function pressSend() {
  await act(async () => {
    fireEvent.press(sendButton());
  });
}

beforeEach(() => {
  mockFake = createFakeSupabase();
  useAuthStore.setState(SIGNED_OUT);
  useFriendsStore.getState().clearFriends();
  clearToast();
  useSpotsStore.setState({ spots: [spotA, spotB, spotC, spotD] });
  useMediaStore.setState({ mediaBySpot: {} });
  useMediaStore.getState().setAll(['a', 'b', 'c', 'd'].map(photo));
  router = { push: jest.fn() };
  jest.mocked(useRouter).mockReturnValue(router as never);
  onClose = jest.fn();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.mocked(createSend).mockReset();
  jest.mocked(makeSendLink).mockReset();
  jest.mocked(Clipboard.setStringAsync).mockClear();
  jest.mocked(syncNow).mockReset().mockResolvedValue(undefined);
  jest.mocked(refreshFriends).mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  clearToast();
  warn.mockRestore();
});

describe('SendSheet without an account', () => {
  it("an unconfigured build says accounts aren't set up", async () => {
    mockFake = null;
    await renderSheet();
    expect(screen.getByText(ACCOUNTS_NOT_SET_UP)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
  });

  it("signed out shows 'Sign in to send spots to friends' and Sign in, which closes and opens sign-in", async () => {
    await renderSheet();
    expect(screen.getByText('Sign in to send spots to friends')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(onClose).toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith('/auth/sign-in');
  });

  it('Cancel closes the sheet', async () => {
    await renderSheet();
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('SendSheet signed in', () => {
  it("shows 'Send 3 spots', '3 spots' with their thumbnails, a checkbox per friend and the D34 sentence", async () => {
    signIn();
    await renderSheet();

    expect(screen.getByText('Send 3 spots')).toBeOnTheScreen();
    expect(screen.getByText('3 spots')).toBeOnTheScreen();
    const uris = screen.UNSAFE_getAllByType(Image).map((i) => (i.props.source as { uri: string }).uri);
    expect(uris).toEqual(['a', 'b', 'c'].map((id) => resolvePhotoUri(`photos/${id}/m.jpg`)));
    expect(friend('@ana').props.accessibilityState).toMatchObject({ checked: false });
    expect(friend('@ben').props.accessibilityState).toMatchObject({ checked: false });
    expect(screen.getByText('Ana B')).toBeOnTheScreen();
    expect(screen.getByText(D34_MANY(3))).toBeOnTheScreen();
  });

  it('shows at most three thumbnails', async () => {
    signIn();
    await renderSheet(['a', 'b', 'c', 'd']);
    expect(screen.getByText('4 spots')).toBeOnTheScreen();
    expect(screen.UNSAFE_getAllByType(Image)).toHaveLength(3);
    expect(screen.getByText(D34_MANY(4))).toBeOnTheScreen();
  });

  it("one spot reads 'Send this spot', '1 spot' and 'this spot' in the sentence", async () => {
    signIn();
    await renderSheet(['a']);
    expect(screen.getByText('Send this spot')).toBeOnTheScreen();
    expect(screen.getByText('1 spot')).toBeOnTheScreen();
    expect(screen.getByText(D34_ONE)).toBeOnTheScreen();
  });

  it('a spot without photos shows no thumbnail', async () => {
    signIn();
    useMediaStore.setState({ mediaBySpot: {} });
    await renderSheet(['a']);
    expect(screen.UNSAFE_queryAllByType(Image)).toHaveLength(0);
  });

  it('Send is disabled until a friend is checked; a second tap unchecks', async () => {
    signIn();
    await renderSheet();
    expect(sendButton().props.accessibilityState).toMatchObject({ disabled: true });

    fireEvent.press(friend('@ana'));
    expect(friend('@ana').props.accessibilityState).toMatchObject({ checked: true });
    expect(sendButton().props.accessibilityState).toMatchObject({ disabled: false });

    fireEvent.press(friend('@ana'));
    expect(sendButton().props.accessibilityState).toMatchObject({ disabled: true });
  });

  it("Send backs up, calls createSend with the ids and the rider's name, closes and toasts 'Sent to @ana'", async () => {
    signIn();
    jest.mocked(createSend).mockResolvedValue({ sentTo: [ANA] });
    await renderSheet();

    fireEvent.press(friend('@ana'));
    await pressSend();

    expect(syncNow).toHaveBeenCalledWith(db);
    expect(createSend).toHaveBeenCalledTimes(1);
    expect(createSend).toHaveBeenCalledWith(db, mockFake, 'user-me', {
      spotIds: ['a', 'b', 'c'],
      recipientIds: ['id-ana'],
      sender: { username: 'me', display_name: 'Me Myself' },
    });
    expect(jest.mocked(syncNow).mock.invocationCallOrder[0]).toBeLessThan(
      jest.mocked(createSend).mock.invocationCallOrder[0],
    );
    expect(onClose).toHaveBeenCalled();
    expect(useToastStore.getState().text).toBe('Sent to @ana');
  });

  it("two friends toast 'Sent to @ana and @ben', three 'Sent to 3 friends'", async () => {
    signIn({ ...EMPTY_FRIENDS, friends: [ANA, BEN, CAL].map(friendRow) });
    jest.mocked(createSend).mockResolvedValueOnce({ sentTo: [ANA, BEN] });
    await renderSheet();
    fireEvent.press(friend('@ana'));
    fireEvent.press(friend('@ben'));
    await pressSend();
    expect(jest.mocked(createSend).mock.calls[0][3].recipientIds).toEqual(['id-ana', 'id-ben']);
    expect(useToastStore.getState().text).toBe('Sent to @ana and @ben');

    screen.unmount();
    jest.mocked(createSend).mockResolvedValueOnce({ sentTo: [ANA, BEN, CAL] });
    await renderSheet();
    fireEvent.press(friend('@ana'));
    fireEvent.press(friend('@ben'));
    fireEvent.press(friend('@cal'));
    await pressSend();
    expect(useToastStore.getState().text).toBe('Sent to 3 friends');
  });

  it("reads 'Sending…' while the send runs, and a double tap sends once", async () => {
    signIn();
    let finish!: (r: SendResult) => void;
    jest.mocked(createSend).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await renderSheet();
    fireEvent.press(friend('@ana'));

    await act(async () => {
      fireEvent.press(sendButton());
      fireEvent.press(sendButton());
    });
    expect(screen.getByText('Sending…')).toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(screen.getByText('Sending…'));
    });
    expect(syncNow).toHaveBeenCalledTimes(1);
    expect(createSend).toHaveBeenCalledTimes(1);

    await act(async () => finish({ sentTo: [ANA] }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a spot not backed up yet keeps the sheet open with the D78 line', async () => {
    signIn();
    jest.mocked(createSend).mockRejectedValue(new NotBackedUpError(1));
    await renderSheet();
    fireEvent.press(friend('@ana'));
    await pressSend();

    expect(screen.getByText(NOT_BACKED_UP)).toBeOnTheScreen();
    expect(onClose).not.toHaveBeenCalled();
    expect(useToastStore.getState().text).toBeNull();
    expect(sendButton().props.accessibilityState).toMatchObject({ disabled: false });
  });

  it("a failed send says \"Couldn't send. Try again.\" and warns", async () => {
    signIn();
    jest.mocked(createSend).mockRejectedValue(new Error('network down'));
    await renderSheet();
    fireEvent.press(friend('@ana'));
    await pressSend();

    expect(screen.getByText(FAILED)).toBeOnTheScreen();
    expect(warn).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a lost session (null) and a first friend failing read the same line', async () => {
    signIn();
    jest.mocked(createSend).mockResolvedValueOnce(null);
    await renderSheet();
    fireEvent.press(friend('@ana'));
    await pressSend();
    expect(screen.getByText(FAILED)).toBeOnTheScreen();

    jest.mocked(createSend).mockResolvedValueOnce({ sentTo: [], failed: { to: ANA, message: 'boom' } });
    await pressSend();
    expect(screen.getByText(FAILED)).toBeOnTheScreen();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a partial send names who got it, unchecks them and keeps the rest for Try again', async () => {
    signIn();
    jest.mocked(createSend).mockResolvedValueOnce({ sentTo: [ANA], failed: { to: BEN, message: 'boom' } });
    await renderSheet();
    fireEvent.press(friend('@ana'));
    fireEvent.press(friend('@ben'));
    await pressSend();

    expect(screen.getByText("Sent to @ana. Couldn't send to @ben. Try again.")).toBeOnTheScreen();
    expect(friend('@ana').props.accessibilityState).toMatchObject({ checked: false });
    expect(friend('@ben').props.accessibilityState).toMatchObject({ checked: true });
    expect(onClose).not.toHaveBeenCalled();

    jest.mocked(createSend).mockResolvedValueOnce({ sentTo: [BEN] });
    await pressSend();
    expect(jest.mocked(createSend).mock.calls[1][3].recipientIds).toEqual(['id-ben']);
    expect(onClose).toHaveBeenCalled();
    expect(useToastStore.getState().text).toBe('Sent to @ben');
  });

  it("with no friends says 'Add a friend first' and 'Find friends' opens /friends", async () => {
    signIn(EMPTY_FRIENDS);
    await renderSheet();
    expect(screen.getByText('Add a friend first')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();

    fireEvent.press(screen.getByRole('link', { name: 'Find friends' }));
    expect(onClose).toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith('/friends');
  });

  it('friends not loaded yet: a spinner, and the sheet asks for a friends load', async () => {
    mockFake?.setSession(fakeSession({ userId: 'user-me' }));
    useAuthStore.setState(RIDER);
    await renderSheet();
    expect(screen.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
    expect(refreshFriends).toHaveBeenCalledWith(db, mockFake, 'user-me');
    expect(screen.queryByText('Add a friend first')).toBeNull();
  });

  it('friends already loaded: no extra load', async () => {
    signIn();
    await renderSheet();
    expect(refreshFriends).not.toHaveBeenCalled();
  });

  it("more than 100 spots: \"That's 101 spots. Send up to 100 at a time.\" and no Send", async () => {
    signIn();
    const ids = Array.from({ length: 101 }, (_, i) => `s${i}`);
    useSpotsStore.setState({ spots: ids.map((id) => createTestSpot({ id, owner_id: 'user-me' })) });
    await renderSheet(ids);
    expect(screen.getByText("That's 101 spots. Send up to 100 at a time.")).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
  });
});

describe('SendSheet review fixes (S7-04)', () => {
  it('while sending, Cancel is disabled and a swipe-down does not close; the finish closes once', async () => {
    signIn();
    let finish!: (r: SendResult) => void;
    jest.mocked(createSend).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await renderSheet();
    fireEvent.press(friend('@ana'));
    await pressSend();

    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(cancel.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(cancel);
    act(() => screen.UNSAFE_getByType(Modal).props.onRequestClose());
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => finish({ sentTo: [ANA] }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useToastStore.getState().text).toBe('Sent to @ana');
  });

  it('a swipe-down closes when nothing is sending', async () => {
    signIn();
    await renderSheet();
    act(() => screen.UNSAFE_getByType(Modal).props.onRequestClose());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a checked friend who leaves the friends list (removed, blocked) is not sent to', async () => {
    signIn();
    jest.mocked(createSend).mockResolvedValue({ sentTo: [BEN] });
    await renderSheet();
    fireEvent.press(friend('@ana'));
    act(() => useFriendsStore.getState().applyFriends('user-me', { ...EMPTY_FRIENDS, friends: [BEN].map(friendRow) }));
    expect(sendButton().props.accessibilityState).toMatchObject({ disabled: true });

    fireEvent.press(friend('@ben'));
    await pressSend();
    expect(jest.mocked(createSend).mock.calls[0][3].recipientIds).toEqual(['id-ben']);
  });

  it("a failed first friends load offers 'Try again', which loads again", async () => {
    mockFake?.setSession(fakeSession({ userId: 'user-me' }));
    useAuthStore.setState(RIDER);
    useFriendsStore.getState().setLoadError('user-me', 'offline');
    await renderSheet();
    expect(screen.getByText("Couldn't load your friends.")).toBeOnTheScreen();
    expect(refreshFriends).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(refreshFriends).toHaveBeenCalledTimes(2);
  });
});

describe('SendSheet review fixes (S7-08)', () => {
  const PROFILE_FAILED = "Couldn't load your profile. Try again.";

  it('a rider whose profile did not load gets a line, not a silent tap; the profile is read again and the next tap sends', async () => {
    signIn();
    useAuthStore.setState({ username: null, displayName: null });
    mockFake!.profiles.set('user-me', { username: 'me', display_name: 'Me Myself' });
    jest.mocked(createSend).mockResolvedValue({ sentTo: [ANA] });
    await renderSheet();
    fireEvent.press(friend('@ana'));
    await pressSend();

    expect(screen.getByText(PROFILE_FAILED)).toBeOnTheScreen();
    expect(createSend).not.toHaveBeenCalled();
    expect(useAuthStore.getState().username).toBe('me');

    await pressSend();
    expect(createSend).toHaveBeenCalledWith(db, mockFake, 'user-me', {
      spotIds: ['a', 'b', 'c'],
      recipientIds: ['id-ana'],
      sender: { username: 'me', display_name: 'Me Myself' },
    });
  });

  it('Cancel works while the backup before a send runs, and then nothing is sent', async () => {
    signIn();
    let backedUp!: () => void;
    jest.mocked(syncNow).mockReturnValue(new Promise<void>((resolve) => (backedUp = resolve)));
    await renderSheet();
    fireEvent.press(friend('@ana'));
    await pressSend();

    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(cancel.props.accessibilityState).toMatchObject({ disabled: false });
    fireEvent.press(cancel);
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => backedUp());
    expect(createSend).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useToastStore.getState().text).toBeNull();
  });

  it('a swipe-down while the backup runs closes the sheet too, and nothing is sent', async () => {
    signIn();
    let backedUp!: () => void;
    jest.mocked(syncNow).mockReturnValue(new Promise<void>((resolve) => (backedUp = resolve)));
    await renderSheet();
    fireEvent.press(friend('@ana'));
    await pressSend();

    act(() => screen.UNSAFE_getByType(Modal).props.onRequestClose());
    expect(onClose).toHaveBeenCalledTimes(1);
    screen.unmount();
    await act(async () => backedUp());
    expect(createSend).not.toHaveBeenCalled();
  });

  it('VoiceOver hears the failure, D78 and partial lines (a live region is Android only)', async () => {
    // the calls of earlier tests (the sheet's toasts) stay on the spy
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    announce.mockClear();
    signIn();
    jest.mocked(createSend).mockRejectedValueOnce(new Error('offline'));
    await renderSheet();
    fireEvent.press(friend('@ana'));
    await pressSend();
    expect(announce).toHaveBeenLastCalledWith(FAILED);

    jest.mocked(createSend).mockRejectedValueOnce(new NotBackedUpError(1));
    await pressSend();
    expect(announce).toHaveBeenLastCalledWith(NOT_BACKED_UP);

    fireEvent.press(friend('@ben'));
    jest.mocked(createSend).mockResolvedValueOnce({ sentTo: [ANA], failed: { to: BEN, message: 'x' } });
    await pressSend();
    expect(announce).toHaveBeenLastCalledWith("Sent to @ana. Couldn't send to @ben. Try again.");
    expect(announce).toHaveBeenCalledTimes(3);
    announce.mockRestore();
  });
});

describe('SendSheet copy (D34: Send is a copy, never the live word)', () => {
  const WRONG = /share|invite/i;

  it('no state of the sheet renders Share, Shared or Invite (any case)', async () => {
    await renderSheet();
    expect(allText()).not.toMatch(WRONG);
    screen.unmount();

    signIn(EMPTY_FRIENDS);
    await renderSheet();
    expect(allText()).not.toMatch(WRONG);
    screen.unmount();

    signIn();
    jest.mocked(createSend).mockResolvedValue({ sentTo: [ANA], failed: { to: BEN, message: 'x' } });
    await renderSheet();
    fireEvent.press(friend('@ana'));
    fireEvent.press(friend('@ben'));
    await pressSend();
    expect(allText()).not.toMatch(WRONG);
    screen.unmount();

    signIn();
    jest.mocked(makeSendLink).mockRejectedValue(new Error('x'));
    await renderSheet();
    fireEvent.press(screen.getByRole('button', { name: 'Copy link instead' }));
    expect(allText()).not.toMatch(WRONG);
    await pressCopyLink();
    expect(allText()).not.toMatch(WRONG);
  });

  it('the source file never says Share (any case)', () => {
    const source = readFileSync(join(__dirname, '../components/SendSheet.tsx'), 'utf8');
    expect(source).not.toMatch(/share/i);
  });
});

describe('SendSheet Copy link instead (S9-03)', () => {
  const D44 = 'Anyone with the link can see these spots until it expires. No account needed to look.';
  const LINK_FAILED = "Couldn't make the link. Try again.";
  const PROFILE_FAILED = "Couldn't load your profile. Try again.";
  const URL = 'https://hitlist.example/s/#t=abcdefghijklmnopqrstuv';
  const toLink = () => fireEvent.press(screen.getByRole('button', { name: 'Copy link instead' }));
  const chip = (label: string) => screen.getByRole('button', { name: label });

  it("'Copy link instead' hides the friends and shows the expiry chips (30 days selected), the D44 line and Copy link", async () => {
    signIn();
    await renderSheet();
    toLink();

    expect(screen.queryByRole('checkbox', { name: '@ana' })).toBeNull();
    expect(screen.queryByText('Friends')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
    expect(screen.queryByText(D34_MANY(3))).toBeNull();
    expect(screen.getByText(D44)).toBeOnTheScreen();
    for (const label of ['1 day', '7 days', 'Never']) {
      expect(chip(label).props.accessibilityState).toMatchObject({ selected: false });
    }
    expect(chip('30 days').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByRole('button', { name: 'Copy link' }).props.accessibilityState).toMatchObject({
      disabled: false,
    });

    fireEvent.press(chip('7 days'));
    expect(chip('7 days').props.accessibilityState).toMatchObject({ selected: true });
    expect(chip('30 days').props.accessibilityState).toMatchObject({ selected: false });
  });

  it('Copy link backs up, makes a 30-day link, copies its URL, toasts Link copied and closes', async () => {
    signIn();
    jest.mocked(makeSendLink).mockResolvedValue(URL);
    await renderSheet();
    toLink();
    await pressCopyLink();

    expect(syncNow).toHaveBeenCalledWith(db);
    expect(makeSendLink).toHaveBeenCalledTimes(1);
    expect(makeSendLink).toHaveBeenCalledWith(db, mockFake, 'user-me', {
      spotIds: ['a', 'b', 'c'],
      sender: { username: 'me', display_name: 'Me Myself' },
      expiry: '30d',
    });
    expect(createSend).not.toHaveBeenCalled();
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(URL);
    const order = [syncNow, makeSendLink, Clipboard.setStringAsync].map(
      (fn) => jest.mocked(fn).mock.invocationCallOrder[0],
    );
    expect(order).toEqual([...order].sort((x, y) => x - y));
    expect(useToastStore.getState().text).toBe('Link copied');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['1 day', '1d'],
    ['7 days', '7d'],
    ['30 days', '30d'],
    ['Never', 'never'],
  ])("the chip '%s' makes a link with expiry %s", async (label, expiry) => {
    signIn();
    jest.mocked(makeSendLink).mockResolvedValue(URL);
    await renderSheet();
    toLink();
    fireEvent.press(chip(label));
    await pressCopyLink();
    expect(jest.mocked(makeSendLink).mock.calls[0][3].expiry).toBe(expiry);
  });

  it("'Send to friends instead' brings the friends, the D34 line and Send back", async () => {
    signIn();
    await renderSheet();
    toLink();
    fireEvent.press(screen.getByRole('button', { name: 'Send to friends instead' }));

    expect(friend('@ana')).toBeOnTheScreen();
    expect(screen.getByText(D34_MANY(3))).toBeOnTheScreen();
    expect(screen.queryByText(D44)).toBeNull();
    expect(sendButton()).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Copy link instead' })).toBeOnTheScreen();
  });

  it("a failure (or no link) says \"Couldn't make the link. Try again.\" and keeps the sheet open", async () => {
    signIn();
    jest.mocked(makeSendLink).mockRejectedValueOnce(new Error('network down'));
    await renderSheet();
    toLink();
    await pressCopyLink();

    expect(screen.getByText(LINK_FAILED)).toBeOnTheScreen();
    expect(warn).toHaveBeenCalled();
    expect(Clipboard.setStringAsync).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(useToastStore.getState().text).toBeNull();

    jest.mocked(makeSendLink).mockResolvedValueOnce(null);
    await pressCopyLink();
    expect(screen.getByText(LINK_FAILED)).toBeOnTheScreen();
    expect(makeSendLink).toHaveBeenCalledTimes(2);
    expect(Clipboard.setStringAsync).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a spot not backed up yet shows the D78 line', async () => {
    signIn();
    jest.mocked(makeSendLink).mockRejectedValue(new NotBackedUpError(1));
    await renderSheet();
    toLink();
    await pressCopyLink();
    expect(screen.getByText(NOT_BACKED_UP)).toBeOnTheScreen();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('no username: the profile line, the profile is read again, and the next tap makes the link', async () => {
    signIn();
    useAuthStore.setState({ username: null, displayName: null });
    mockFake!.profiles.set('user-me', { username: 'me', display_name: 'Me Myself' });
    jest.mocked(makeSendLink).mockResolvedValue(URL);
    await renderSheet();
    toLink();
    await pressCopyLink();

    expect(screen.getByText(PROFILE_FAILED)).toBeOnTheScreen();
    expect(makeSendLink).not.toHaveBeenCalled();
    expect(syncNow).not.toHaveBeenCalled();
    expect(useAuthStore.getState().username).toBe('me');

    await pressCopyLink();
    expect(jest.mocked(makeSendLink).mock.calls[0][3].sender).toEqual({ username: 'me', display_name: 'Me Myself' });
  });

  it("reads 'Making link…' and locks the sheet while the link is made; a second tap makes one link", async () => {
    signIn();
    let finish!: (url: string | null) => void;
    jest.mocked(makeSendLink).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await renderSheet();
    toLink();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Copy link' }));
      fireEvent.press(screen.getByRole('button', { name: 'Copy link' }));
    });
    expect(screen.getByText('Making link…')).toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(screen.getByText('Making link…'));
    });
    expect(syncNow).toHaveBeenCalledTimes(1);
    expect(makeSendLink).toHaveBeenCalledTimes(1);

    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(cancel.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(cancel);
    act(() => screen.UNSAFE_getByType(Modal).props.onRequestClose());
    expect(screen.getByRole('button', { name: 'Send to friends instead' }).props.accessibilityState).toMatchObject({
      disabled: true,
    });
    expect(chip('7 days').props.accessibilityState).toMatchObject({ disabled: true });
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => finish(URL));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useToastStore.getState().text).toBe('Link copied');
  });

  it('Cancel works while the backup before a link runs, and then no link is made', async () => {
    signIn();
    let backedUp!: () => void;
    jest.mocked(syncNow).mockReturnValue(new Promise<void>((resolve) => (backedUp = resolve)));
    await renderSheet();
    toLink();
    await pressCopyLink();

    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(cancel.props.accessibilityState).toMatchObject({ disabled: false });
    fireEvent.press(cancel);
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => backedUp());
    expect(makeSendLink).not.toHaveBeenCalled();
    expect(Clipboard.setStringAsync).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("the row shows with no friends ('Add a friend first'), and a link needs none", async () => {
    signIn(EMPTY_FRIENDS);
    jest.mocked(makeSendLink).mockResolvedValue(URL);
    await renderSheet();
    expect(screen.getByText('Add a friend first')).toBeOnTheScreen();
    toLink();
    expect(screen.queryByText('Add a friend first')).toBeNull();
    await pressCopyLink();
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(URL);
  });

  it('the row shows after a failed friends load too', async () => {
    mockFake?.setSession(fakeSession({ userId: 'user-me' }));
    useAuthStore.setState(RIDER);
    useFriendsStore.getState().setLoadError('user-me', 'offline');
    jest.mocked(makeSendLink).mockResolvedValue(URL);
    await renderSheet();
    expect(screen.getByText("Couldn't load your friends.")).toBeOnTheScreen();
    toLink();
    expect(screen.queryByText("Couldn't load your friends.")).toBeNull();
    await pressCopyLink();
    expect(useToastStore.getState().text).toBe('Link copied');
  });
});
