import React from 'react';
import { AccessibilityInfo, Alert, AppState, RefreshControl, type AlertButton, type AppStateStatus } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useIsFocused, useRouter } from 'expo-router';
import { useSQLiteContext as sharedDb } from 'expo-sqlite';

import { createFakeSupabase, fakeSession, type FakeSupabase } from './helpers/fake-supabase';

let mockFake: FakeSupabase | null = null;
jest.mock('@/src/sync/client', () => ({
  getSupabase: () => mockFake,
  isConfigured: () => mockFake !== null,
}));
// The calls are src/sync/friends.ts's (tested in sync-friends.test.ts); here only what the tab asks of them.
jest.mock('@/src/sync/friends', () => ({
  ...jest.requireActual('@/src/sync/friends'),
  respond: jest.fn().mockResolvedValue(undefined),
  block: jest.fn().mockResolvedValue(undefined),
  refreshFriends: jest.fn().mockResolvedValue(undefined),
}));
// The calls are src/sync/sends.ts's (tested in sync-sends.test.ts); here only what the tab asks of them (S7-05).
jest.mock('@/src/sync/sends', () => ({
  ...jest.requireActual('@/src/sync/sends'),
  saveSend: jest.fn(),
  hasPendingSave: jest.fn().mockReturnValue(false),
  dismissSend: jest.fn().mockResolvedValue(undefined),
  loadAndApplySends: jest.fn().mockResolvedValue(undefined),
}));
// The calls are src/sync/lists.ts's (tested in sync-lists.test.ts); here only what the tab asks of them (S8-06).
jest.mock('@/src/sync/lists', () => ({
  ...jest.requireActual('@/src/sync/lists'),
  respondInvite: jest.fn().mockResolvedValue(true),
  loadAndApplyInvites: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/src/sync/engine', () => ({ syncNow: jest.fn().mockResolvedValue(undefined) }));
// The seen mark's SQL is inbox-store.test.ts's (real SQLite); jest.setup's shared db can't run queries.
jest.mock('@/src/db/sync', () => ({
  ...jest.requireActual('@/src/db/sync'),
  getSyncState: jest.fn().mockResolvedValue(undefined),
  setSyncState: jest.fn().mockResolvedValue(undefined),
}));

import InboxTab from '@/app/(tabs)/inbox';
import { ACCOUNTS_NOT_SET_UP } from '@/src/components';
import { getSyncState, setSyncState } from '@/src/db/sync';
import { SIGNED_OUT, useAuthStore, type AuthSnapshot } from '@/src/stores/auth-store';
import { selectUnseenCount, useInboxStore, type InboxItem } from '@/src/stores/inbox-store';
import { block, refreshFriends, respond } from '@/src/sync/friends';
import { syncNow } from '@/src/sync/engine';
import { loadAndApplyInvites, NotAllowedError, respondInvite } from '@/src/sync/lists';
import { useHitListsStore } from '@/src/stores/hit-lists-store';
import { joinList } from '@/src/sync/join';
import { createTestHitList } from './factories';
import { dismissSend, hasPendingSave, loadAndApplySends, saveSend } from '@/src/sync/sends';
import type { FrozenSpot, SendPayload } from '@/src/utils/send-payload';

const ME = 'user-me';
const RIDER: AuthSnapshot = {
  status: 'signed_in',
  userId: ME,
  email: 'me@example.com',
  username: 'me',
  displayName: null,
};

const request = (id: string, username: string | null, created_at: string, display_name: string | null = null): InboxItem => ({
  kind: 'friend_request',
  id,
  created_at,
  friendshipId: id,
  from: { id: `id-${username ?? id}`, username, display_name },
});

const ANA = request('f-ana', 'ana', '2026-10-22T10:00:00.000Z', 'Ana B');
const BEN = request('f-ben', 'ben', '2026-10-21T10:00:00.000Z');
const NEWEST = ANA.created_at;

const EMPTY_TITLE = 'Nothing here yet';
const EMPTY_BODY = 'Spots friends send you, hit list invitations and friend requests show up here.';
const BLOCK_MESSAGE = "They won't be told. They can't send to you or invite you.";

let router: { push: jest.Mock };
let alert: jest.SpyInstance;
let warn: jest.SpyInstance;
let appStateListeners: ((state: AppStateStatus) => void)[];
const db = sharedDb();

function signIn(items: InboxItem[] = [ANA, BEN]) {
  mockFake?.setSession(fakeSession({ userId: ME }));
  useAuthStore.setState(RIDER);
  useInboxStore.setState({ userId: ME, items, seenAt: null });
}

async function renderTab() {
  const view = render(<InboxTab />);
  await act(async () => {});
  return view;
}

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

beforeEach(() => {
  mockFake = createFakeSupabase();
  useAuthStore.setState(SIGNED_OUT);
  useInboxStore.getState().clearInbox();
  router = { push: jest.fn() };
  jest.mocked(useRouter).mockReturnValue(router as never);
  jest.mocked(useIsFocused).mockReturnValue(true);
  // react-native's jest mock makes currentState a function; on the phone it is the state string
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true, writable: true });
  appStateListeners = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((type, listener) => {
    if (type === 'change') appStateListeners.push(listener as (state: AppStateStatus) => void);
    return {
      remove: () => {
        appStateListeners = appStateListeners.filter((l) => l !== listener);
      },
    } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.mocked(respond).mockReset().mockResolvedValue(undefined);
  jest.mocked(block).mockReset().mockResolvedValue(undefined);
  jest.mocked(refreshFriends).mockReset().mockResolvedValue(undefined);
  jest.mocked(saveSend).mockReset().mockResolvedValue({ status: 'saved', saved: 3, failedPhotos: 0 });
  jest.mocked(hasPendingSave).mockReset().mockReturnValue(false);
  jest.mocked(dismissSend).mockReset().mockResolvedValue(undefined);
  jest.mocked(loadAndApplySends).mockReset().mockResolvedValue(undefined);
  jest.mocked(getSyncState).mockReset().mockResolvedValue(undefined);
  jest.mocked(setSyncState).mockReset().mockResolvedValue(undefined);
  jest.mocked(respondInvite).mockReset().mockResolvedValue(true);
  jest.mocked(loadAndApplyInvites).mockReset().mockResolvedValue(undefined);
  jest.mocked(syncNow).mockReset().mockResolvedValue(undefined);
  useHitListsStore.setState({ lists: [], membershipBySpot: {} });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Inbox tab signed out / unconfigured', () => {
  it("signed out shows 'Sign in to get spots from friends' and a Sign in button", async () => {
    await renderTab();

    expect(screen.getByText('Sign in to get spots from friends')).toBeOnTheScreen();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(router.push).toHaveBeenCalledWith('/auth/sign-in');
    expect(refreshFriends).not.toHaveBeenCalled();
  });

  it.each([
    ['no client', () => (mockFake = null)],
    ["status 'unconfigured'", () => useAuthStore.setState({ ...SIGNED_OUT, status: 'unconfigured' })],
  ])("an unconfigured build (%s) says accounts aren't set up", async (_name, setUp) => {
    setUp();
    await renderTab();

    expect(screen.getByText(ACCOUNTS_NOT_SET_UP)).toBeOnTheScreen();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('a rider still choosing a username sees the Sign in line, not the requests', async () => {
    useAuthStore.setState({ ...SIGNED_OUT, status: 'needs_username', userId: ME });
    useInboxStore.setState({ userId: ME, items: [ANA], seenAt: null });
    await renderTab();

    expect(screen.getByText('Sign in to get spots from friends')).toBeOnTheScreen();
    expect(screen.queryByText('@ana wants to be friends')).toBeNull();
  });
});

describe('Inbox tab signed in', () => {
  it("lists two incoming requests under 'Friend requests', each with Accept and Decline", async () => {
    signIn();
    await renderTab();

    expect(screen.getByRole('header', { name: 'Friend requests' })).toBeOnTheScreen();
    expect(screen.getByText('@ana wants to be friends')).toBeOnTheScreen();
    expect(screen.getByText('Ana B')).toBeOnTheScreen();
    expect(screen.getByText('@ben wants to be friends')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Accept friend request from @ana' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Decline friend request from @ana' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Accept friend request from @ben' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Decline friend request from @ben' })).toBeOnTheScreen();
    expect(screen.queryByText(EMPTY_TITLE)).toBeNull();
  });

  it('shows the newest request first', async () => {
    signIn([BEN, ANA]);
    await renderTab();

    const lines = screen.getAllByText(/wants to be friends$/).map((n) => n.props.children);
    expect(lines).toEqual(['@ana wants to be friends', '@ben wants to be friends']);
  });

  it("a requester whose name isn't readable reads 'A rider wants to be friends'", async () => {
    signIn([request('f-x', null, NEWEST)]);
    await renderTab();

    expect(screen.getByText('A rider wants to be friends')).toBeOnTheScreen();
  });

  it.each([
    ['Accept', 'accept'],
    ['Decline', 'decline'],
  ] as const)('%s calls respond(id, %s), then loads friends again', async (label, action) => {
    signIn();
    await renderTab();
    jest.mocked(refreshFriends).mockClear();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: `${label} friend request from @ben` }));
    });

    expect(respond).toHaveBeenCalledTimes(1);
    expect(respond).toHaveBeenCalledWith(mockFake, ME, 'f-ben', action);
    expect(refreshFriends).toHaveBeenCalledWith(db, mockFake, ME);
  });

  it.each(['Accept', 'Decline'])('an answered request leaves the list at once (%s), before any friends load', async (label) => {
    signIn();
    await renderTab();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: `${label} friend request from @ana` }));
    });

    // refreshFriends is mocked: nothing reloads, so the row must go on the answer itself (no second answer to it)
    expect(screen.queryByText('@ana wants to be friends')).toBeNull();
    expect(screen.getByText('@ben wants to be friends')).toBeOnTheScreen();
  });

  it('a blocked requester leaves the list at once', async () => {
    signIn();
    await renderTab();

    fireEvent(screen.getByText('@ana wants to be friends'), 'longPress');
    await pressAlertButton('Block @ana');
    await pressAlertButton('Block');

    expect(screen.queryByText('@ana wants to be friends')).toBeNull();
  });

  it('a double tap on Accept sends one respond', async () => {
    signIn();
    let finish: () => void = () => {};
    jest.mocked(respond).mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)));
    await renderTab();

    const accept = screen.getByRole('button', { name: 'Accept friend request from @ana' });
    await act(async () => {
      fireEvent.press(accept);
      fireEvent.press(accept);
    });
    // and Decline on the same row while Accept runs
    expect(screen.queryByRole('button', { name: 'Decline friend request from @ana' })).toBeNull();
    await act(async () => finish());

    expect(respond).toHaveBeenCalledTimes(1);
  });

  it("a failed respond alerts \"Couldn't reach the server\" and warns", async () => {
    signIn();
    jest.mocked(respond).mockRejectedValue(new Error('offline'));
    await renderTab();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Accept friend request from @ana' }));
    });

    expect(alert).toHaveBeenCalledWith("Couldn't reach the server", 'Try again.');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[Inbox]'), 'offline');
    expect(screen.getByRole('button', { name: 'Accept friend request from @ana' })).toBeOnTheScreen();
  });

  it("long press on a request offers 'Block @ana' with the confirm, and Block calls block", async () => {
    signIn();
    await renderTab();

    fireEvent(screen.getByText('@ana wants to be friends'), 'longPress');
    expect(lastAlert().title).toBe('@ana');
    await pressAlertButton('Block @ana');
    expect(lastAlert()).toMatchObject({ title: 'Block @ana?', message: BLOCK_MESSAGE });
    expect(lastAlert().buttons.map((b) => b.text)).toEqual(['Cancel', 'Block']);
    await pressAlertButton('Block');

    expect(block).toHaveBeenCalledWith(mockFake, ME, 'id-ana');
  });

  it('a request row exposes Block as a VoiceOver action', async () => {
    signIn();
    await renderTab();

    // the display name is read with the line
    const row = screen.getByRole('button', { name: '@ana wants to be friends, Ana B' });
    expect(row.props.accessibilityActions).toEqual([{ name: 'block', label: 'Block @ana' }]);
    fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'block' } });
    expect(lastAlert().title).toBe('Block @ana?');
  });

  it("with nothing shows 'Nothing here yet' and what shows up here", async () => {
    signIn([]);
    await renderTab();

    expect(screen.getByText(EMPTY_TITLE)).toBeOnTheScreen();
    expect(screen.getByText(EMPTY_BODY)).toBeOnTheScreen();
    expect(screen.queryByText('Friend requests')).toBeNull();
  });

  it('loads friends when focused and on pull to refresh', async () => {
    signIn();
    await renderTab();
    expect(refreshFriends).toHaveBeenCalledWith(db, mockFake, ME);
    jest.mocked(refreshFriends).mockClear();

    await act(async () => {
      screen.UNSAFE_getByType(RefreshControl).props.onRefresh();
    });

    expect(refreshFriends).toHaveBeenCalledWith(db, mockFake, ME);
  });
});

describe('Inbox tab: seen', () => {
  it("focused, it marks the items seen under the rider's key with the newest server time; the badge drops", async () => {
    signIn();
    expect(selectUnseenCount(useInboxStore.getState())).toBe(2);
    await renderTab();

    expect(setSyncState).toHaveBeenCalledWith(db, `inbox_seen_at:${ME}`, NEWEST);
    expect(selectUnseenCount(useInboxStore.getState())).toBe(0);
  });

  it('not focused, it marks nothing', async () => {
    jest.mocked(useIsFocused).mockReturnValue(false);
    signIn();
    await renderTab();

    expect(setSyncState).not.toHaveBeenCalled();
    expect(selectUnseenCount(useInboxStore.getState())).toBe(2);
  });

  it('a request arriving while focused is marked too', async () => {
    signIn([BEN]);
    await renderTab();
    expect(setSyncState).toHaveBeenLastCalledWith(db, `inbox_seen_at:${ME}`, BEN.created_at);

    await act(async () => {
      useInboxStore.getState().setItems(ME, 'friend_request', [ANA, BEN]);
    });

    expect(setSyncState).toHaveBeenLastCalledWith(db, `inbox_seen_at:${ME}`, NEWEST);
    expect(selectUnseenCount(useInboxStore.getState())).toBe(0);
  });

  it('in the background a new request stays unseen until the app is active again', async () => {
    signIn([BEN]);
    await renderTab();
    await act(async () => appStateListeners.forEach((l) => l('background')));
    jest.mocked(setSyncState).mockClear();

    await act(async () => {
      useInboxStore.getState().setItems(ME, 'friend_request', [ANA, BEN]);
    });
    expect(setSyncState).not.toHaveBeenCalled();
    expect(selectUnseenCount(useInboxStore.getState())).toBe(1);

    await act(async () => appStateListeners.forEach((l) => l('active')));
    expect(setSyncState).toHaveBeenCalledWith(db, `inbox_seen_at:${ME}`, NEWEST);
  });
});

describe('Inbox tab: spots sent to you (S7-05)', () => {
  const SEND_ID = '11111111-1111-4111-8111-111111111111';
  const frozen = (id: string, name: string | null, town: string | null, photos: FrozenSpot['photos'] = []): FrozenSpot => ({
    id,
    name,
    generated_name: town,
    lat: 47.6,
    lng: -122.3,
    feature_types: [],
    stopped: false,
    natural_speed: null,
    notes: null,
    photos,
  });
  const PHOTO = { media_id: '22222222-2222-4222-8222-222222222222', captured_at: null };
  const PAYLOAD: SendPayload = {
    v: 1,
    sender: { username: 'ana', display_name: 'Ana B' },
    spots: [
      frozen('s-1', 'Pier 57', 'Capitol Hill', [{ ...PHOTO, path: `sends/${SEND_ID}/${PHOTO.media_id}.jpg` }]),
      frozen('s-2', null, 'Fremont'),
      frozen('s-3', 'Red ledge', null),
    ],
  };
  const sendItem = (payload: SendPayload = PAYLOAD, id = SEND_ID): InboxItem => ({
    kind: 'send',
    id,
    sendId: id,
    created_at: '2026-10-23T09:00:00.000Z',
    from: payload.sender,
    payload,
  });
  const SEND = sendItem();

  const press = async (name: string) => {
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name }));
    });
  };

  it("renders '@ana sent you 3 spots' under 'Spots sent to you', the first spot and its thumbnail, and the four buttons", async () => {
    signIn([SEND]);
    await renderTab();

    expect(screen.getByRole('header', { name: 'Spots sent to you' })).toBeOnTheScreen();
    expect(screen.getByText('@ana sent you 3 spots')).toBeOnTheScreen();
    expect(screen.getByText('Pier 57 · Capitol Hill')).toBeOnTheScreen();
    // the fake's signed URL names the path and the lifetime it was asked for
    expect(screen.getByTestId('send-thumbnail').props.source).toEqual({
      uri: `https://storage.test/photos/${PAYLOAD.spots[0].photos[0].path}?expires=600`,
    });
    for (const name of [
      'Save all spots from @ana',
      'Save the spots from @ana into a new hit list',
      'Pick spots from @ana',
      'Dismiss the spots from @ana',
    ]) {
      expect(screen.getByRole('button', { name })).toBeOnTheScreen();
    }
  });

  it("one spot reads 'sent you a spot'; a send without photos shows no thumbnail", async () => {
    signIn([sendItem({ ...PAYLOAD, spots: [frozen('s-2', null, 'Fremont')] })]);
    await renderTab();

    expect(screen.getByText('@ana sent you a spot')).toBeOnTheScreen();
    expect(screen.getByText('Untitled · Fremont')).toBeOnTheScreen();
    expect(screen.queryByTestId('send-thumbnail')).toBeNull();
    expect(mockFake!.storage.from).not.toHaveBeenCalled();
  });

  it("Save all calls saveSend with the item; the item leaves and 'Saved 3 spots' shows", async () => {
    signIn([SEND, ANA]);
    jest.mocked(saveSend).mockImplementation(async (_db, _client, uid, item) => {
      useInboxStore.getState().removeItem(uid, 'send', item.id);
      return { status: 'saved', saved: 3, failedPhotos: 0 };
    });
    await renderTab();

    await press('Save all spots from @ana');

    expect(saveSend).toHaveBeenCalledTimes(1);
    expect(saveSend).toHaveBeenCalledWith(db, mockFake, ME, SEND, {});
    expect(screen.queryByText('@ana sent you 3 spots')).toBeNull();
    expect(screen.getByText('Saved 3 spots')).toBeOnTheScreen();
  });

  it('the saved line is gone once the tab loses focus', async () => {
    signIn([SEND]);
    const view = await renderTab();
    await press('Save all spots from @ana');
    expect(screen.getByText('Saved 3 spots')).toBeOnTheScreen();

    jest.mocked(useIsFocused).mockReturnValue(false);
    view.rerender(<InboxTab />);
    await act(async () => {});
    jest.mocked(useIsFocused).mockReturnValue(true);
    view.rerender(<InboxTab />);
    await act(async () => {});

    expect(screen.queryByText('Saved 3 spots')).toBeNull();
  });

  it("a result with failedPhotos reads 'Saved 3 spots · 1 photo couldn't be downloaded'", async () => {
    signIn([SEND]);
    jest.mocked(saveSend).mockResolvedValue({ status: 'saved', saved: 3, failedPhotos: 1 });
    await renderTab();

    await press('Save all spots from @ana');

    expect(screen.getByText("Saved 3 spots · 1 photo couldn't be downloaded")).toBeOnTheScreen();
  });

  it("'Save into a new hit list' calls saveSend with newList and reads 'Saved 3 spots into From @ana'", async () => {
    signIn([SEND]);
    jest.mocked(saveSend).mockResolvedValue({ status: 'saved', saved: 3, failedPhotos: 2, listId: 'list-1' });
    await renderTab();

    await press('Save the spots from @ana into a new hit list');

    expect(saveSend).toHaveBeenCalledWith(db, mockFake, ME, SEND, { newList: true });
    expect(screen.getByText("Saved 3 spots into From @ana · 2 photos couldn't be downloaded")).toBeOnTheScreen();
  });

  it('a double tap on Save all saves once, and the other buttons wait while it runs', async () => {
    signIn([SEND]);
    let finish: () => void = () => {};
    jest.mocked(saveSend).mockImplementation(
      () => new Promise((resolve) => (finish = () => resolve({ status: 'saved', saved: 3, failedPhotos: 0 }))),
    );
    await renderTab();

    const saveAll = screen.getByRole('button', { name: 'Save all spots from @ana' });
    await act(async () => {
      fireEvent.press(saveAll);
      fireEvent.press(saveAll);
    });
    expect(screen.queryByRole('button', { name: 'Dismiss the spots from @ana' })).toBeNull();
    expect(screen.getByLabelText('Saving these spots')).toBeOnTheScreen();
    await act(async () => finish());

    expect(saveSend).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ status: 'taken_back' } as const, '@ana took these spots back.'],
    [{ status: 'already_saved' } as const, 'Already saved'],
    [{ status: 'failed' } as const, "Couldn't save these spots. Try again."],
    [null, "Couldn't save these spots. Try again."],
  ])('a save that answers %p shows %p', async (result, line) => {
    signIn([SEND]);
    jest.mocked(saveSend).mockResolvedValue(result);
    await renderTab();

    await press('Save all spots from @ana');

    expect(screen.getByText(line)).toBeOnTheScreen();
  });

  it("a save that throws warns and reads \"Couldn't save these spots. Try again.\"; the buttons come back", async () => {
    signIn([SEND]);
    jest.mocked(saveSend).mockRejectedValue(new Error('disk full'));
    await renderTab();

    await press('Save all spots from @ana');

    expect(screen.getByText("Couldn't save these spots. Try again.")).toBeOnTheScreen();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[Inbox]'), 'disk full');
    expect(screen.getByRole('button', { name: 'Save all spots from @ana' })).toBeOnTheScreen();
  });

  it("'Pick spots' lists the three frozen spots checked; unchecking one saves the other two with 'Save (2)'", async () => {
    signIn([SEND]);
    jest.mocked(saveSend).mockResolvedValue({ status: 'saved', saved: 2, failedPhotos: 0 });
    await renderTab();

    await press('Pick spots from @ana');
    expect(screen.getByRole('header', { name: 'Pick spots' })).toBeOnTheScreen();
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes.map((b) => b.props.accessibilityLabel)).toEqual(['Pier 57, Capitol Hill', 'Untitled, Fremont', 'Red ledge']);
    expect(boxes.every((b) => b.props.accessibilityState.checked)).toBe(true);
    expect(screen.getByRole('button', { name: 'Save (3)' })).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('checkbox', { name: 'Untitled, Fremont' }));
    await press('Save (2)');

    expect(saveSend).toHaveBeenCalledWith(db, mockFake, ME, SEND, { spotIds: ['s-1', 's-3'] });
    expect(screen.queryByRole('header', { name: 'Pick spots' })).toBeNull();
    expect(screen.getByText('Saved 2 spots')).toBeOnTheScreen();
  });

  it("the picker's Save is disabled with nothing checked, and Cancel closes it without saving", async () => {
    signIn([SEND]);
    await renderTab();

    await press('Pick spots from @ana');
    for (const name of ['Pier 57, Capitol Hill', 'Untitled, Fremont', 'Red ledge']) {
      fireEvent.press(screen.getByRole('checkbox', { name }));
    }
    const save = screen.getByRole('button', { name: 'Save (0)' });
    expect(save.props.accessibilityState).toMatchObject({ disabled: true });
    await press('Save (0)');
    expect(saveSend).not.toHaveBeenCalled();

    await press('Cancel');
    expect(screen.queryByRole('header', { name: 'Pick spots' })).toBeNull();
    expect(saveSend).not.toHaveBeenCalled();
  });

  it("Dismiss asks 'Dismiss these spots?' (@ana won't be told) and Dismiss calls dismissSend once", async () => {
    signIn([SEND]);
    await renderTab();

    await press('Dismiss the spots from @ana');
    expect(lastAlert()).toMatchObject({ title: 'Dismiss these spots?', message: "@ana won't be told." });
    expect(lastAlert().buttons.map((b) => b.text)).toEqual(['Cancel', 'Dismiss']);
    const confirm = lastAlert().buttons.find((b) => b.text === 'Dismiss')!;
    await act(async () => {
      confirm.onPress?.();
      confirm.onPress?.();
    });

    expect(dismissSend).toHaveBeenCalledTimes(1);
    expect(dismissSend).toHaveBeenCalledWith(mockFake, ME, SEND_ID);
  });

  it("Cancel on the Dismiss confirm does nothing; a failed dismiss alerts \"Couldn't reach the server\"", async () => {
    signIn([SEND]);
    jest.mocked(dismissSend).mockRejectedValue(new Error('offline'));
    await renderTab();

    await press('Dismiss the spots from @ana');
    await pressAlertButton('Cancel');
    expect(dismissSend).not.toHaveBeenCalled();

    await press('Dismiss the spots from @ana');
    await pressAlertButton('Dismiss');
    expect(alert).toHaveBeenLastCalledWith("Couldn't reach the server", 'Try again.');
    expect(screen.getByText('@ana sent you 3 spots')).toBeOnTheScreen();
  });

  it('the saved line is announced to VoiceOver once', async () => {
    signIn([SEND]);
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    // react-native's jest mock makes it a jest.fn already: earlier tests' calls are on it
    announce.mockClear();
    await renderTab();

    await press('Save all spots from @ana');

    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('Saved 3 spots');
    expect(screen.getByText('Saved 3 spots').props.accessibilityLiveRegion).toBeUndefined();
  });

  it('a save that finishes after the tab lost focus leaves no line for the next visit', async () => {
    signIn([SEND]);
    let finish: () => void = () => {};
    jest.mocked(saveSend).mockImplementation(
      () => new Promise((resolve) => (finish = () => resolve({ status: 'saved', saved: 3, failedPhotos: 0 }))),
    );
    const view = await renderTab();
    await press('Save all spots from @ana');

    jest.mocked(useIsFocused).mockReturnValue(false);
    view.rerender(<InboxTab />);
    await act(async () => finish());
    jest.mocked(useIsFocused).mockReturnValue(true);
    view.rerender(<InboxTab />);
    await act(async () => {});

    expect(screen.queryByText('Saved 3 spots')).toBeNull();
  });

  it("a save the server may have marked offers only 'Try again', which retries it as it was", async () => {
    signIn([SEND]);
    jest.mocked(saveSend).mockResolvedValue({ status: 'failed' });
    await renderTab();

    await press('Save the spots from @ana into a new hit list');
    jest.mocked(hasPendingSave).mockReturnValue(true);
    await act(async () => {
      useInboxStore.getState().setItems(ME, 'send', [{ ...SEND }]);
    });

    expect(hasPendingSave).toHaveBeenCalledWith(ME, SEND_ID);
    expect(screen.queryByRole('button', { name: 'Pick spots from @ana' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Dismiss the spots from @ana' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save all spots from @ana' })).toBeNull();
    jest.mocked(saveSend).mockClear();
    await press('Try saving the spots from @ana again');

    expect(saveSend).toHaveBeenCalledWith(db, mockFake, ME, SEND, {});
  });

  it("while a Dismiss runs the row's spinner reads 'Dismissing'", async () => {
    signIn([SEND]);
    jest.mocked(dismissSend).mockImplementation(() => new Promise(() => {}));
    await renderTab();

    await press('Dismiss the spots from @ana');
    await pressAlertButton('Dismiss');

    expect(screen.getByLabelText('Dismissing')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Saving these spots')).toBeNull();
  });

  it('loads the sends with the friends when focused and on pull to refresh', async () => {
    signIn([SEND]);
    await renderTab();
    expect(loadAndApplySends).toHaveBeenCalledWith(db, mockFake, ME);
    jest.mocked(loadAndApplySends).mockClear();

    await act(async () => {
      screen.UNSAFE_getByType(RefreshControl).props.onRefresh();
    });

    expect(loadAndApplySends).toHaveBeenCalledWith(db, mockFake, ME);
  });

  it('marks a new send seen while focused (the badge counts sends too)', async () => {
    signIn([SEND]);
    expect(selectUnseenCount(useInboxStore.getState())).toBe(1);
    await renderTab();

    expect(setSyncState).toHaveBeenCalledWith(db, `inbox_seen_at:${ME}`, SEND.created_at);
    expect(selectUnseenCount(useInboxStore.getState())).toBe(0);
  });
});

describe('Inbox tab: invitations (S8-06)', () => {
  const invite = (spotCount: number, listId = 'L-downtown', listName = 'Downtown'): InboxItem => ({
    kind: 'invite',
    id: listId,
    created_at: '2026-10-23T09:00:00.000Z',
    listId,
    listName,
    listKind: 'manual',
    from: { id: 'u-ana', username: 'ana', display_name: null },
    role: 'add',
    spotCount,
  });
  const DOWNTOWN = invite(12);

  const press = async (name: string) => {
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name }));
    });
  };

  it("renders '@ana invited you to Downtown (12 spots)' under 'Invitations' with Join and Decline", async () => {
    signIn([DOWNTOWN, invite(1, 'L-one', 'Bridges'), invite(0, 'L-new', 'Ledges')]);
    await renderTab();

    expect(screen.getByRole('header', { name: 'Invitations' })).toBeOnTheScreen();
    expect(screen.getByText('@ana invited you to Downtown (12 spots)')).toBeOnTheScreen();
    expect(screen.getByText('@ana invited you to Bridges (1 spot)')).toBeOnTheScreen();
    expect(screen.getByText('@ana invited you to Ledges (no spots yet)')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Join Downtown' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Decline the invitation to Downtown' })).toBeOnTheScreen();
  });

  it("Join calls respondInvite then syncNow; the row leaves and 'Joined Downtown' shows, with Open once the list is here", async () => {
    signIn([DOWNTOWN]);
    // the sync is still running: the list isn't on the phone yet
    jest.mocked(syncNow).mockImplementation(() => new Promise(() => {}));
    await renderTab();

    await press('Join Downtown');

    expect(respondInvite).toHaveBeenCalledWith(db, mockFake, ME, 'L-downtown', 'join');
    expect(syncNow).toHaveBeenCalledWith(db);
    expect(jest.mocked(respondInvite).mock.invocationCallOrder[0]).toBeLessThan(
      jest.mocked(syncNow).mock.invocationCallOrder[0],
    );
    expect(screen.queryByText('@ana invited you to Downtown (12 spots)')).toBeNull();
    expect(screen.getByText('Joined Downtown')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Open Downtown' })).toBeNull();

    await act(async () => {
      useHitListsStore.setState({ lists: [createTestHitList({ id: 'L-downtown', name: 'Downtown', owner_id: 'u-ana' })] });
    });
    await press('Open Downtown');

    expect(router.push).toHaveBeenCalledWith('/list/L-downtown');
  });

  it("the 'Joined' line is announced to VoiceOver once", async () => {
    signIn([DOWNTOWN]);
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    announce.mockClear();
    await renderTab();

    await press('Join Downtown');

    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('Joined Downtown');
  });

  it('a double tap on Join joins once', async () => {
    signIn([DOWNTOWN]);
    let finish: (v: boolean) => void = () => {};
    jest.mocked(respondInvite).mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    await renderTab();

    const join = screen.getByRole('button', { name: 'Join Downtown' });
    await act(async () => {
      fireEvent.press(join);
      fireEvent.press(join);
    });
    expect(screen.getByLabelText('Joining')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Decline the invitation to Downtown' })).toBeNull();
    await act(async () => finish(true));

    expect(respondInvite).toHaveBeenCalledTimes(1);
    expect(syncNow).toHaveBeenCalledTimes(1);
  });

  it("an invitation withdrawn meanwhile reads 'This invitation was withdrawn.' and syncs nothing", async () => {
    signIn([DOWNTOWN]);
    jest.mocked(respondInvite).mockRejectedValue(new NotAllowedError('This invitation was withdrawn.'));
    await renderTab();

    await press('Join Downtown');

    expect(screen.getByText('This invitation was withdrawn.')).toBeOnTheScreen();
    expect(screen.queryByText('@ana invited you to Downtown (12 spots)')).toBeNull();
    expect(syncNow).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
  });

  it("a failed Join alerts \"Couldn't reach the server\" and keeps the row", async () => {
    signIn([DOWNTOWN]);
    jest.mocked(respondInvite).mockRejectedValue(new Error('offline'));
    await renderTab();

    await press('Join Downtown');

    expect(alert).toHaveBeenLastCalledWith("Couldn't reach the server", 'Try again.');
    expect(warn).toHaveBeenCalled();
    expect(screen.getByText('@ana invited you to Downtown (12 spots)')).toBeOnTheScreen();
    expect(screen.queryByText('Joined Downtown')).toBeNull();
    expect(syncNow).not.toHaveBeenCalled();
  });

  it('a Join the phone may not make yet (respondInvite false) alerts and keeps the row', async () => {
    signIn([DOWNTOWN]);
    jest.mocked(respondInvite).mockResolvedValue(false);
    await renderTab();

    await press('Join Downtown');

    expect(alert).toHaveBeenLastCalledWith("Couldn't reach the server", 'Try again.');
    expect(screen.getByText('@ana invited you to Downtown (12 spots)')).toBeOnTheScreen();
    expect(syncNow).not.toHaveBeenCalled();
  });

  it("Decline asks 'Decline the invitation to Downtown?'; Cancel does nothing, Decline calls respondInvite and the row leaves", async () => {
    signIn([DOWNTOWN]);
    await renderTab();

    await press('Decline the invitation to Downtown');
    expect(lastAlert().title).toBe('Decline the invitation to Downtown?');
    expect(lastAlert().message).toBeUndefined();
    expect(lastAlert().buttons.map((b) => b.text)).toEqual(['Cancel', 'Decline']);
    await pressAlertButton('Cancel');
    expect(respondInvite).not.toHaveBeenCalled();

    await press('Decline the invitation to Downtown');
    await pressAlertButton('Decline');

    expect(respondInvite).toHaveBeenCalledWith(db, mockFake, ME, 'L-downtown', 'decline');
    expect(screen.queryByText('@ana invited you to Downtown (12 spots)')).toBeNull();
    expect(syncNow).not.toHaveBeenCalled();
  });

  it("long press on an invitation offers 'Block @ana' with the confirm, and Block calls block", async () => {
    signIn([DOWNTOWN]);
    await renderTab();

    await act(async () => {
      fireEvent(screen.getByLabelText('@ana invited you to Downtown (12 spots)'), 'longPress');
    });
    await pressAlertButton('Block @ana');
    expect(lastAlert().title).toBe('Block @ana?');
    expect(lastAlert().message).toBe(BLOCK_MESSAGE);
    await pressAlertButton('Block');

    expect(block).toHaveBeenCalledWith(mockFake, ME, 'u-ana');
    expect(screen.queryByText('@ana invited you to Downtown (12 spots)')).toBeNull();
  });

  it("Decline and Block on an invitation read 'Answering' meanwhile, never 'Sending' (D34: no Send words on a Share row)", async () => {
    signIn([DOWNTOWN]);
    jest.mocked(respondInvite).mockImplementation(() => new Promise(() => {}));
    await renderTab();

    await press('Decline the invitation to Downtown');
    await pressAlertButton('Decline');

    expect(screen.getByLabelText('Answering')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Sending your answer')).toBeNull();
  });

  it('a failed Decline alerts and keeps the row; so does one the phone may not make yet', async () => {
    signIn([DOWNTOWN]);
    jest.mocked(respondInvite).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(false);
    await renderTab();

    for (let i = 0; i < 2; i++) {
      await press('Decline the invitation to Downtown');
      await pressAlertButton('Decline');
      expect(alert).toHaveBeenLastCalledWith("Couldn't reach the server", 'Try again.');
      expect(screen.getByText('@ana invited you to Downtown (12 spots)')).toBeOnTheScreen();
    }
  });

  it('a block from an invitation reloads the invitations and the friends (a load already running loses)', async () => {
    signIn([DOWNTOWN]);
    await renderTab();
    jest.mocked(loadAndApplyInvites).mockClear();
    jest.mocked(refreshFriends).mockClear();

    await act(async () => {
      fireEvent(screen.getByLabelText('@ana invited you to Downtown (12 spots)'), 'longPress');
    });
    await pressAlertButton('Block @ana');
    await pressAlertButton('Block');

    expect(loadAndApplyInvites).toHaveBeenCalledWith(db, mockFake, ME);
    expect(refreshFriends).toHaveBeenCalledWith(db, mockFake, ME);
  });

  it('Decline while a Join of the same list runs (from the Lists tab) does nothing: the join wins', async () => {
    signIn([DOWNTOWN]);
    let finish: (v: boolean) => void = () => {};
    jest.mocked(respondInvite).mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    await renderTab();
    let joined: Promise<unknown> = Promise.resolve();
    await act(async () => {
      joined = joinList(db, mockFake as never, ME, 'L-downtown');
    });

    await press('Decline the invitation to Downtown');
    const decline = lastAlert().buttons.find((b) => b.text === 'Decline');
    if (decline) await pressAlertButton('Decline');

    expect(respondInvite).toHaveBeenCalledTimes(1);
    expect(respondInvite).toHaveBeenLastCalledWith(db, mockFake, ME, 'L-downtown', 'join');
    await act(async () => {
      finish(true);
      await joined;
    });
  });

  it("'Open' stays hidden for a joined list that was deleted meanwhile", async () => {
    signIn([DOWNTOWN]);
    useHitListsStore.setState({
      lists: [createTestHitList({ id: 'L-downtown', name: 'Downtown', deleted_at: '2026-10-23T10:00:00.000Z' })],
    });
    await renderTab();

    await press('Join Downtown');

    expect(screen.getByText('Joined Downtown')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Open Downtown' })).toBeNull();
  });

  it('loads the invitations with the rest when focused and on pull to refresh', async () => {
    signIn([DOWNTOWN]);
    await renderTab();
    expect(loadAndApplyInvites).toHaveBeenCalledWith(db, mockFake, ME);
    jest.mocked(loadAndApplyInvites).mockClear();

    await act(async () => {
      screen.UNSAFE_getByType(RefreshControl).props.onRefresh();
    });

    expect(loadAndApplyInvites).toHaveBeenCalledWith(db, mockFake, ME);
  });

  it('marks a new invitation seen while focused (the badge counts invitations too)', async () => {
    signIn([DOWNTOWN]);
    expect(selectUnseenCount(useInboxStore.getState())).toBe(1);
    await renderTab();

    expect(setSyncState).toHaveBeenCalledWith(db, `inbox_seen_at:${ME}`, DOWNTOWN.created_at);
    expect(selectUnseenCount(useInboxStore.getState())).toBe(0);
  });
});
