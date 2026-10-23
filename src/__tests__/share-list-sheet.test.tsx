import { readFileSync } from 'fs';
import { join } from 'path';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import { useSQLiteContext as sharedDb } from 'expo-sqlite';

import { createFakeSupabase, fakeSession, type FakeSupabase } from './helpers/fake-supabase';

let mockFake: FakeSupabase | null = null;
jest.mock('@/src/sync/client', () => ({
  getSupabase: () => mockFake,
  isConfigured: () => mockFake !== null,
}));
// The calls themselves are src/sync/lists.ts's (sync-lists.test.ts); here only what the sheet asks of them.
jest.mock('@/src/sync/lists', () => ({
  ...jest.requireActual('@/src/sync/lists'),
  shareList: jest.fn(),
  invite: jest.fn(),
}));
jest.mock('@/src/sync/engine', () => ({ syncNow: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/src/sync/friends', () => ({
  ...jest.requireActual('@/src/sync/friends'),
  refreshFriends: jest.fn().mockResolvedValue(undefined),
}));

import { ACCOUNTS_NOT_SET_UP } from '@/src/components';
import { ShareListSheet } from '@/src/components/ShareListSheet';
import { useHitListsStore, useSpotsStore } from '@/src/stores';
import { SIGNED_OUT, useAuthStore, type AuthSnapshot } from '@/src/stores/auth-store';
import { EMPTY_FRIENDS, useFriendsStore } from '@/src/stores/friends-store';
import { clearToast, useToastStore } from '@/src/stores/toast-store';
import { syncNow } from '@/src/sync/engine';
import { type FriendsData } from '@/src/sync/friends';
import { invite, ListNotBackedUpError, NotAllowedError, shareList } from '@/src/sync/lists';
import type { HitList } from '@/src/types';
import { CITIES, createTestHitList, createTestSpot } from './factories';

const RIDER: AuthSnapshot = {
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
const ANA = profile('id-ana', 'ana', 'Ana B');
const BEN = profile('id-ben', 'ben');
const CAL = profile('id-cal', 'cal');
const friendRow = (p: typeof ANA) => ({ friendshipId: `f-${p.id}`, created_at: '2026-10-20T10:00:00.000Z', profile: p });
const FRIENDS: FriendsData = { ...EMPTY_FRIENDS, friends: [ANA, BEN].map(friendRow) };

const D34 = (name: string) =>
  `Everyone here sees every spot in ${name} — including spots added later — until you remove them or stop sharing.`;
const AREA_LINE = "They'll see your spots inside this area, now and later";
const NOT_BACKED_UP = "This list isn't backed up yet. Try again when you're online.";
const FAILED = "Couldn't share. Try again.";

const db = sharedDb();
let router: { push: jest.Mock };
let onClose: jest.Mock;
let warn: jest.SpyInstance;

const spots = Array.from({ length: 12 }, (_, i) => createTestSpot({ id: `s${i}`, owner_id: 'user-me' }));
const downtown = createTestHitList({ id: 'L-downtown', name: 'Downtown', owner_id: 'user-me' });

function setList(list: HitList, spotIds = spots.map((s) => s.id)) {
  useHitListsStore.setState({
    lists: [list],
    membershipBySpot: Object.fromEntries(spotIds.map((id) => [id, [list.id]])),
    activeListId: null,
  });
}

function signIn(data: FriendsData = FRIENDS) {
  mockFake?.setSession(fakeSession({ userId: 'user-me' }));
  useAuthStore.setState(RIDER);
  useFriendsStore.getState().applyFriends('user-me', data);
}

async function renderSheet(mode: 'share' | 'invite' = 'share', listId = downtown.id) {
  render(<ShareListSheet listId={listId} mode={mode} onClose={onClose} />);
  await act(async () => {});
}

const friend = (handle: string) => screen.getByRole('checkbox', { name: handle });
const shareButton = (name = 'Share') => screen.getByRole('button', { name });
const allText = () =>
  screen
    .queryAllByText(/./)
    .map((t) => [t.props.children].flat().join(''))
    .join('\n');

async function press(el: ReturnType<typeof screen.getByRole>) {
  await act(async () => {
    fireEvent.press(el);
  });
}

beforeEach(() => {
  mockFake = createFakeSupabase();
  useAuthStore.setState(SIGNED_OUT);
  useFriendsStore.getState().clearFriends();
  clearToast();
  useSpotsStore.setState({ spots });
  setList(downtown);
  router = { push: jest.fn() };
  jest.mocked(useRouter).mockReturnValue(router as never);
  onClose = jest.fn();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.mocked(shareList).mockReset().mockResolvedValue(true);
  jest.mocked(invite).mockReset().mockResolvedValue(true);
  jest.mocked(syncNow).mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  clearToast();
  warn.mockRestore();
});

describe('ShareListSheet without an account', () => {
  it("an unconfigured build says accounts aren't set up", async () => {
    mockFake = null;
    await renderSheet();
    expect(screen.getByText(ACCOUNTS_NOT_SET_UP)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
  });

  it("signed out shows 'Sign in to share hit lists' and Sign in, which closes and opens sign-in", async () => {
    await renderSheet();
    expect(screen.getByText('Sign in to share hit lists')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();

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

describe('ShareListSheet signed in', () => {
  it("shows 'Share Downtown', a checkbox per friend, the roles, the D34 sentence and the count line", async () => {
    signIn();
    await renderSheet();

    expect(screen.getByText('Share Downtown')).toBeOnTheScreen();
    expect(friend('@ana').props.accessibilityState).toMatchObject({ checked: false });
    expect(friend('@ben').props.accessibilityState).toMatchObject({ checked: false });
    expect(screen.getByText('Ana B')).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Can add spots' }).props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByRole('tab', { name: 'View only' }).props.accessibilityState).toMatchObject({ selected: false });
    expect(screen.getByText(D34('Downtown'))).toBeOnTheScreen();
    expect(screen.getByText('12 spots will become visible to them')).toBeOnTheScreen();
    expect(screen.queryByText(AREA_LINE)).toBeNull();
  });

  it("reads 'One spot will become visible to them' for one, and no count line for an empty list", async () => {
    signIn();
    setList(downtown, ['s0']);
    await renderSheet();
    expect(screen.getByText('One spot will become visible to them')).toBeOnTheScreen();

    await act(async () => setList(downtown, []));
    expect(screen.queryByText(/will become visible/)).toBeNull();
  });

  it('Share is disabled until a friend is checked; a second tap unchecks', async () => {
    signIn();
    await renderSheet();
    expect(shareButton().props.accessibilityState).toMatchObject({ disabled: true });

    fireEvent.press(friend('@ana'));
    expect(friend('@ana').props.accessibilityState).toMatchObject({ checked: true });
    expect(shareButton().props.accessibilityState).toMatchObject({ disabled: false });

    fireEvent.press(friend('@ana'));
    expect(shareButton().props.accessibilityState).toMatchObject({ disabled: true });
  });

  it("Share backs up, calls shareList(listId, [ana], 'add'), closes and toasts 'Shared Downtown with @ana'", async () => {
    signIn();
    await renderSheet();

    fireEvent.press(friend('@ana'));
    await press(shareButton());

    expect(syncNow).toHaveBeenCalledWith(db);
    expect(jest.mocked(syncNow).mock.invocationCallOrder[0]).toBeLessThan(
      jest.mocked(shareList).mock.invocationCallOrder[0],
    );
    expect(shareList).toHaveBeenCalledWith(db, mockFake, 'user-me', 'L-downtown', ['id-ana'], 'add');
    expect(invite).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    expect(useToastStore.getState().text).toBe('Shared Downtown with @ana');
  });

  it("View only shares with role 'view'; two friends toast 'with 2 friends'", async () => {
    signIn();
    await renderSheet();

    fireEvent.press(screen.getByRole('tab', { name: 'View only' }));
    fireEvent.press(friend('@ana'));
    fireEvent.press(friend('@ben'));
    await press(shareButton());

    expect(shareList).toHaveBeenCalledWith(db, mockFake, 'user-me', 'L-downtown', ['id-ana', 'id-ben'], 'view');
    expect(useToastStore.getState().text).toBe('Shared Downtown with 2 friends');
  });

  it('a double tap shares once', async () => {
    signIn();
    let finish: (v: boolean) => void = () => {};
    jest.mocked(shareList).mockReturnValue(new Promise((r) => (finish = r)));
    await renderSheet();

    fireEvent.press(friend('@ana'));
    await press(shareButton());
    await press(screen.getByRole('button', { name: 'Sharing…' }));
    expect(shareList).toHaveBeenCalledTimes(1);
    // can't close while the server call runs
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => finish(true));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Cancel during the backup closes the sheet and nothing is shared', async () => {
    signIn();
    let backedUp: () => void = () => {};
    jest.mocked(syncNow).mockReturnValue(new Promise<void>((r) => (backedUp = r)));
    await renderSheet();

    fireEvent.press(friend('@ana'));
    await press(shareButton());
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => backedUp());
    expect(shareList).not.toHaveBeenCalled();
  });

  it("a list not backed up yet shows the D85 line and stays open", async () => {
    signIn();
    jest.mocked(shareList).mockRejectedValue(new ListNotBackedUpError());
    await renderSheet();

    fireEvent.press(friend('@ana'));
    await press(shareButton());

    expect(screen.getByText(NOT_BACKED_UP)).toBeOnTheScreen();
    expect(onClose).not.toHaveBeenCalled();
    expect(friend('@ana').props.accessibilityState).toMatchObject({ checked: true });
  });

  it("a server error shows \"Couldn't share. Try again.\" and warns; a lost session (false) says the same", async () => {
    signIn();
    jest.mocked(shareList).mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(false);
    await renderSheet();

    fireEvent.press(friend('@ana'));
    await press(shareButton());
    expect(screen.getByText(FAILED)).toBeOnTheScreen();
    expect(warn).toHaveBeenCalled();

    await press(shareButton());
    expect(screen.getByText(FAILED)).toBeOnTheScreen();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("a 42501 shows \"You can't do that in this list any more.\"", async () => {
    signIn();
    jest.mocked(shareList).mockRejectedValue(new NotAllowedError());
    await renderSheet();

    fireEvent.press(friend('@ana'));
    await press(shareButton());
    expect(screen.getByText("You can't do that in this list any more.")).toBeOnTheScreen();
  });

  it("no friends: 'Add a friend first' and 'Find friends', which closes and opens Friends", async () => {
    signIn(EMPTY_FRIENDS);
    await renderSheet();

    expect(screen.getByText('Add a friend first')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
    fireEvent.press(screen.getByRole('link', { name: 'Find friends' }));
    expect(onClose).toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith('/friends');
  });

  it("an area list shares the same way with the line 'They'll see your spots inside this area, now and later'", async () => {
    signIn();
    const area = createTestHitList({
      id: 'L-area',
      name: 'Capitol Hill',
      kind: 'area',
      owner_id: 'user-me',
      area_center: CITIES.seattle,
      area_radius_m: 3219,
    });
    useSpotsStore.setState({ spots: [createTestSpot({ id: 'in', owner_id: 'user-me', location: CITIES.seattle })] });
    setList(area, []);
    await renderSheet('share', 'L-area');

    expect(screen.getByText(AREA_LINE)).toBeOnTheScreen();
    expect(screen.getByText(D34('Capitol Hill'))).toBeOnTheScreen();
    expect(screen.getByText('One spot will become visible to them')).toBeOnTheScreen();
    fireEvent.press(friend('@ben'));
    await press(shareButton());
    expect(shareList).toHaveBeenCalledWith(db, mockFake, 'user-me', 'L-area', ['id-ben'], 'add');
  });

  it('a list that is gone says so', async () => {
    signIn();
    await renderSheet('share', 'L-missing');
    expect(screen.getByText('This list is gone')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
  });
});

describe('ShareListSheet in invite mode (a list already shared)', () => {
  const shared = {
    ...downtown,
    shared: true,
    members: [
      { user_id: 'id-ana', username: 'ana', role: 'add' as const, status: 'member' as const },
      { user_id: 'id-ben', username: 'ben', role: 'view' as const, status: 'invited' as const },
    ],
  };

  it("titles 'Invite to Downtown', marks friends already in it, drops the count line and invites with 'Invite'", async () => {
    signIn({ ...EMPTY_FRIENDS, friends: [ANA, BEN, CAL].map(friendRow) });
    setList(shared);
    await renderSheet('invite');

    expect(screen.getByText('Invite to Downtown')).toBeOnTheScreen();
    expect(screen.queryByRole('checkbox', { name: '@ana' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: '@ben' })).toBeNull();
    expect(screen.getByText('In the list')).toBeOnTheScreen();
    expect(screen.getByText('Invited')).toBeOnTheScreen();
    expect(screen.getByText(D34('Downtown'))).toBeOnTheScreen();
    expect(screen.queryByText(/will become visible/)).toBeNull();

    fireEvent.press(friend('@cal'));
    await press(shareButton('Invite'));
    expect(invite).toHaveBeenCalledWith(db, mockFake, 'user-me', 'L-downtown', ['id-cal'], 'add');
    expect(shareList).not.toHaveBeenCalled();
    expect(useToastStore.getState().text).toBe('Invited @cal');
    expect(onClose).toHaveBeenCalled();
  });
});

describe('ShareListSheet words (D34)', () => {
  it("no render says 'Send'", async () => {
    signIn();
    await renderSheet();
    fireEvent.press(friend('@ana'));
    expect(allText()).not.toMatch(/\bsend/i);
  });

  it("the source never says 'Send', comments included", () => {
    const source = readFileSync(join(__dirname, '../components/ShareListSheet.tsx'), 'utf8');
    expect(source).not.toMatch(/\bsend/i);
  });
});
