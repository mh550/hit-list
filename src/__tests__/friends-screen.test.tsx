import React from 'react';
import { Alert, RefreshControl, type AlertButton } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { createFakeSupabase, fakeSession, type FakeSupabase } from './helpers/fake-supabase';

let mockFake: FakeSupabase | null = null;
jest.mock('@/src/sync/client', () => ({
  getSupabase: () => mockFake,
  isConfigured: () => mockFake !== null,
}));
// The calls are src/sync/friends.ts's (tested in sync-friends.test.ts); here only what the screen asks of them.
jest.mock('@/src/sync/friends', () => ({
  ...jest.requireActual('@/src/sync/friends'),
  addFriend: jest.fn(),
  removeFriend: jest.fn().mockResolvedValue(undefined),
  block: jest.fn().mockResolvedValue(undefined),
  unblock: jest.fn().mockResolvedValue(undefined),
  refreshFriends: jest.fn().mockResolvedValue(undefined),
}));

import FriendsScreen from '@/app/friends/index';
import { ACCOUNTS_NOT_SET_UP } from '@/src/components';
import { SIGNED_OUT, useAuthStore, type AuthSnapshot } from '@/src/stores/auth-store';
import { EMPTY_FRIENDS, useFriendsStore } from '@/src/stores/friends-store';
import { addFriend, block, refreshFriends, removeFriend, unblock, type FriendsData } from '@/src/sync/friends';

const ANA_RIDER: AuthSnapshot = {
  status: 'signed_in',
  userId: 'user-me',
  email: 'me@example.com',
  username: 'me',
  displayName: null,
};

const profile = (id: string, username: string | null, display_name: string | null = null) => ({
  id,
  username,
  display_name,
});

const DATA: FriendsData = {
  friends: [
    { friendshipId: 'f-ana', created_at: '2026-10-20T10:00:00.000Z', profile: profile('id-ana', 'ana', 'Ana B') },
    { friendshipId: 'f-ben', created_at: '2026-10-21T10:00:00.000Z', profile: profile('id-ben', 'ben') },
  ],
  incoming: [],
  outgoing: [{ friendshipId: 'f-cal', created_at: '2026-10-22T10:00:00.000Z', profile: profile('id-cal', 'cal') }],
  blocked: [],
};

const HINT = "Friends are added by exact username or by an invite link. There's no search by name.";
const NETWORK = "Couldn't reach the server. Try again.";

let router: { push: jest.Mock };
let alert: jest.SpyInstance;
let warn: jest.SpyInstance;
const db = useSQLiteContext();

function signIn(data: FriendsData = DATA) {
  mockFake?.setSession(fakeSession({ userId: 'user-me' }));
  useAuthStore.setState(ANA_RIDER);
  useFriendsStore.getState().applyFriends('user-me', data);
}

async function renderScreen() {
  render(<FriendsScreen />);
  await act(async () => {});
}

/** The buttons of the last Alert.alert call. */
function lastAlert(): { title: string; message?: string; buttons: AlertButton[] } {
  const call = alert.mock.calls.at(-1) ?? [];
  return { title: call[0], message: call[1], buttons: (call[2] ?? []) as AlertButton[] };
}

async function pressAlertButton(text: string) {
  const button = lastAlert().buttons.find((b) => b.text === text);
  if (!button) throw new Error(`no '${text}' in the alert`);
  await act(async () => {
    button.onPress?.();
  });
}

async function add(typed: string) {
  fireEvent.changeText(screen.getByPlaceholderText('Add by exact @username'), typed);
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Add' }));
  });
}

beforeEach(() => {
  mockFake = createFakeSupabase();
  useAuthStore.setState(SIGNED_OUT);
  useFriendsStore.getState().clearFriends();
  router = { push: jest.fn() };
  jest.mocked(useRouter).mockReturnValue(router as never);
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.mocked(addFriend).mockReset();
  jest.mocked(removeFriend).mockReset().mockResolvedValue(undefined);
  jest.mocked(block).mockReset().mockResolvedValue(undefined);
  jest.mocked(unblock).mockReset().mockResolvedValue(undefined);
  jest.mocked(refreshFriends).mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  alert.mockRestore();
  warn.mockRestore();
});

describe('Friends screen signed out / unconfigured', () => {
  it("signed out shows 'Sign in to add friends' and a Sign in button only", async () => {
    await renderScreen();
    expect(screen.getByText('Sign in to add friends')).toBeOnTheScreen();
    expect(screen.queryByPlaceholderText('Add by exact @username')).toBeNull();
    expect(screen.queryByText('Friends')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(router.push).toHaveBeenCalledWith('/auth/sign-in');
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(refreshFriends).not.toHaveBeenCalled();
  });

  it("an unconfigured build says accounts aren't set up and nothing else", async () => {
    mockFake = null;
    useAuthStore.setState({ ...SIGNED_OUT, status: 'unconfigured' });
    await renderScreen();
    expect(screen.getByText(ACCOUNTS_NOT_SET_UP)).toBeOnTheScreen();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('Friends screen signed in', () => {
  beforeEach(() => signIn());

  it('loads friends on open', async () => {
    await renderScreen();
    expect(refreshFriends).toHaveBeenCalledWith(db, mockFake, 'user-me');
  });

  it("lists 'Friends' with '@ana · Ana B' and '@ben', 'Requests sent' with '@cal' and Cancel", async () => {
    await renderScreen();
    expect(screen.getByText('Friends')).toBeOnTheScreen();
    expect(screen.getByText('@ana · Ana B')).toBeOnTheScreen();
    expect(screen.getByText('@ben')).toBeOnTheScreen();
    expect(screen.getByText('Requests sent')).toBeOnTheScreen();
    expect(screen.getByText('@cal')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Cancel request to @cal' })).toBeOnTheScreen();
    expect(screen.queryByText('Blocked')).toBeNull();
  });

  it("a sent request whose name this phone never saw reads 'A rider you asked' (D73)", async () => {
    signIn({ ...DATA, outgoing: [{ ...DATA.outgoing[0], profile: profile('id-cal', null) }] });
    await renderScreen();
    expect(screen.getByText('A rider you asked')).toBeOnTheScreen();
  });

  it('shows the add field, its button and the hint', async () => {
    await renderScreen();
    const field = screen.getByPlaceholderText('Add by exact @username');
    expect(field.props.autoCapitalize).toBe('none');
    expect(field.props.autoCorrect).toBe(false);
    expect(screen.getByRole('button', { name: 'Add' })).toBeOnTheScreen();
    expect(screen.getByText(HINT)).toBeOnTheScreen();
  });

  it.each([
    ['sent', 'Request sent to @dee'],
    ['accepted', "You're now friends with @dee"],
    ['already_friends', 'Already friends with @dee'],
    ['already_sent', 'Request already sent to @dee'],
    ['self', "That's you"],
    ['blocked_by_me', 'You blocked @dee. Unblock them below to add them.'],
  ] as const)("Add answers '%s' with '%s'", async (status, line) => {
    jest.mocked(addFriend).mockResolvedValue({ found: true, status, profile: profile('id-dee', 'dee') });
    await renderScreen();
    jest.mocked(refreshFriends).mockClear();
    await add('dee');
    expect(addFriend).toHaveBeenCalledWith(mockFake, db, 'user-me', 'dee');
    expect(screen.getByText(line)).toBeOnTheScreen();
    expect(refreshFriends).toHaveBeenCalledWith(db, mockFake, 'user-me');
  });

  it("Add clears the field after a request went out", async () => {
    jest.mocked(addFriend).mockResolvedValue({ found: true, status: 'sent', profile: profile('id-dee', 'dee') });
    await renderScreen();
    await add('  @Dee ');
    expect(addFriend).toHaveBeenCalledWith(mockFake, db, 'user-me', '  @Dee ');
    expect(screen.getByPlaceholderText('Add by exact @username').props.value).toBe('');
  });

  it("not found (or a rider who blocked you, D50) reads 'No rider named @dee'", async () => {
    jest.mocked(addFriend).mockResolvedValue({ found: false, status: 'not_found' });
    await renderScreen();
    await add('Dee');
    expect(screen.getByText('No rider named @dee')).toBeOnTheScreen();
  });

  it('an invalid name makes no call and explains the pattern (D39)', async () => {
    await renderScreen();
    await add('a b');
    expect(addFriend).not.toHaveBeenCalled();
    expect(screen.getByText('Usernames are 3–20 letters, numbers, _ or .')).toBeOnTheScreen();
  });

  it('a server error reads the network line and warns', async () => {
    jest.mocked(addFriend).mockRejectedValue(new Error('boom'));
    await renderScreen();
    await add('dee');
    expect(screen.getByText(NETWORK)).toBeOnTheScreen();
    expect(warn).toHaveBeenCalled();
  });

  it('a double tap on Add sends one request', async () => {
    let finish: (v: unknown) => void = () => {};
    jest.mocked(addFriend).mockReturnValue(new Promise((resolve) => (finish = resolve)) as never);
    await renderScreen();
    fireEvent.changeText(screen.getByPlaceholderText('Add by exact @username'), 'dee');
    const button = screen.getByRole('button', { name: 'Add' });
    fireEvent.press(button);
    fireEvent.press(button);
    await act(async () => finish({ found: false, status: 'not_found' }));
    expect(addFriend).toHaveBeenCalledTimes(1);
  });

  it("long-pressing a friend offers 'Remove friend' and 'Block @ana'; Remove calls removeFriend", async () => {
    await renderScreen();
    fireEvent(screen.getByText('@ana · Ana B'), 'longPress');
    const { title, buttons } = lastAlert();
    expect(title).toBe('@ana');
    expect(buttons.map((b) => b.text)).toEqual(['Remove friend', 'Block @ana', 'Cancel']);
    expect(buttons[1].style).toBe('destructive');
    jest.mocked(refreshFriends).mockClear();
    await pressAlertButton('Remove friend');
    expect(removeFriend).toHaveBeenCalledWith(mockFake, 'user-me', 'f-ana');
    expect(refreshFriends).toHaveBeenCalledWith(db, mockFake, 'user-me');
  });

  it('Block asks again with the they-won’t-be-told line, then calls block', async () => {
    await renderScreen();
    fireEvent(screen.getByText('@ana · Ana B'), 'longPress');
    await pressAlertButton('Block @ana');
    const confirm = lastAlert();
    expect(confirm.title).toBe('Block @ana?');
    expect(confirm.message).toBe("They won't be told. They can't send to you or invite you.");
    expect(confirm.buttons.map((b) => [b.text, b.style])).toEqual([
      ['Cancel', 'cancel'],
      ['Block', 'destructive'],
    ]);
    expect(block).not.toHaveBeenCalled();
    await pressAlertButton('Block');
    expect(block).toHaveBeenCalledWith(mockFake, 'user-me', 'id-ana');
  });

  it('Cancel on a sent request calls removeFriend once, even on a double tap', async () => {
    let finish: () => void = () => {};
    jest.mocked(removeFriend).mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    await renderScreen();
    const cancel = screen.getByRole('button', { name: 'Cancel request to @cal' });
    fireEvent.press(cancel);
    fireEvent.press(cancel);
    await act(async () => finish());
    expect(removeFriend).toHaveBeenCalledTimes(1);
    expect(removeFriend).toHaveBeenCalledWith(mockFake, 'user-me', 'f-cal');
  });

  it("a failed action shows the network line", async () => {
    jest.mocked(removeFriend).mockRejectedValue(new Error('offline'));
    await renderScreen();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Cancel request to @cal' }));
    });
    expect(screen.getByText(NETWORK)).toBeOnTheScreen();
    expect(warn).toHaveBeenCalled();
  });

  it("a 'Blocked' section lists @dee with Unblock (D74)", async () => {
    signIn({ ...DATA, blocked: [profile('id-dee', 'dee')] });
    await renderScreen();
    expect(screen.getByText('Blocked')).toBeOnTheScreen();
    expect(screen.getByText('@dee')).toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Unblock @dee' }));
    });
    expect(unblock).toHaveBeenCalledWith(mockFake, 'user-me', 'id-dee');
  });

  it("points at the Inbox when requests are waiting there", async () => {
    signIn({ ...DATA, incoming: [{ ...DATA.outgoing[0], friendshipId: 'f-eve', profile: profile('id-eve', 'eve') }] });
    await renderScreen();
    expect(screen.getByText('1 friend request in Inbox')).toBeOnTheScreen();
    expect(screen.queryByText('@eve')).toBeNull();
  });

  it('pull to refresh loads friends again', async () => {
    await renderScreen();
    jest.mocked(refreshFriends).mockClear();
    const control = screen.UNSAFE_getByType(RefreshControl);
    await act(async () => control.props.onRefresh());
    expect(refreshFriends).toHaveBeenCalledWith(db, mockFake, 'user-me');
  });

  it('a load that failed with nothing to show says so', async () => {
    signIn(EMPTY_FRIENDS);
    useFriendsStore.getState().setLoadError('user-me', 'offline');
    await renderScreen();
    expect(screen.getByText("Couldn't reach the server. Pull to try again.")).toBeOnTheScreen();
  });
});
