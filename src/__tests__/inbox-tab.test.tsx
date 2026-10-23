import React from 'react';
import { Alert, AppState, RefreshControl, type AlertButton, type AppStateStatus } from 'react-native';
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
  dismissSend: jest.fn().mockResolvedValue(undefined),
  loadAndApplySends: jest.fn().mockResolvedValue(undefined),
}));
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
import { dismissSend, loadAndApplySends, saveSend } from '@/src/sync/sends';
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
  jest.mocked(dismissSend).mockReset().mockResolvedValue(undefined);
  jest.mocked(loadAndApplySends).mockReset().mockResolvedValue(undefined);
  jest.mocked(getSyncState).mockReset().mockResolvedValue(undefined);
  jest.mocked(setSyncState).mockReset().mockResolvedValue(undefined);
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
    expect(mockFake!.storage.from('photos').createSignedUrl).toHaveBeenCalledWith(PAYLOAD.spots[0].photos[0].path, 600);
    expect(screen.getByTestId('send-thumbnail').props.source).toEqual({
      uri: `https://storage.test/photos/${PAYLOAD.spots[0].photos[0].path}?expires=600`,
    });
    for (const name of ['Save all', 'Save into a new hit list', 'Pick spots', 'Dismiss']) {
      expect(screen.getByRole('button', { name })).toBeOnTheScreen();
    }
  });

  it("one spot reads 'sent you a spot'; a send without photos shows no thumbnail", async () => {
    signIn([sendItem({ ...PAYLOAD, spots: [frozen('s-2', null, 'Fremont')] })]);
    await renderTab();

    expect(screen.getByText('@ana sent you a spot')).toBeOnTheScreen();
    expect(screen.getByText('Untitled · Fremont')).toBeOnTheScreen();
    expect(screen.queryByTestId('send-thumbnail')).toBeNull();
    expect(mockFake!.storage.from('photos').createSignedUrl).not.toHaveBeenCalled();
  });

  it("Save all calls saveSend with the item; the item leaves and 'Saved 3 spots' shows", async () => {
    signIn([SEND, ANA]);
    jest.mocked(saveSend).mockImplementation(async (_db, _client, uid, item) => {
      useInboxStore.getState().removeItem(uid, 'send', item.id);
      return { status: 'saved', saved: 3, failedPhotos: 0 };
    });
    await renderTab();

    await press('Save all');

    expect(saveSend).toHaveBeenCalledTimes(1);
    expect(saveSend).toHaveBeenCalledWith(db, mockFake, ME, SEND, {});
    expect(screen.queryByText('@ana sent you 3 spots')).toBeNull();
    expect(screen.getByText('Saved 3 spots')).toBeOnTheScreen();
  });

  it("a result with failedPhotos reads 'Saved 3 spots · 1 photo couldn't be downloaded'", async () => {
    signIn([SEND]);
    jest.mocked(saveSend).mockResolvedValue({ status: 'saved', saved: 3, failedPhotos: 1 });
    await renderTab();

    await press('Save all');

    expect(screen.getByText("Saved 3 spots · 1 photo couldn't be downloaded")).toBeOnTheScreen();
  });

  it("'Save into a new hit list' calls saveSend with newList and reads 'Saved 3 spots into From @ana'", async () => {
    signIn([SEND]);
    jest.mocked(saveSend).mockResolvedValue({ status: 'saved', saved: 3, failedPhotos: 2, listId: 'list-1' });
    await renderTab();

    await press('Save into a new hit list');

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

    const saveAll = screen.getByRole('button', { name: 'Save all' });
    await act(async () => {
      fireEvent.press(saveAll);
      fireEvent.press(saveAll);
    });
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
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

    await press('Save all');

    expect(screen.getByText(line)).toBeOnTheScreen();
  });

  it("a save that throws warns and reads \"Couldn't save these spots. Try again.\"; the buttons come back", async () => {
    signIn([SEND]);
    jest.mocked(saveSend).mockRejectedValue(new Error('disk full'));
    await renderTab();

    await press('Save all');

    expect(screen.getByText("Couldn't save these spots. Try again.")).toBeOnTheScreen();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[Inbox]'), 'disk full');
    expect(screen.getByRole('button', { name: 'Save all' })).toBeOnTheScreen();
  });

  it("'Pick spots' lists the three frozen spots checked; unchecking one saves the other two with 'Save (2)'", async () => {
    signIn([SEND]);
    await renderTab();

    await press('Pick spots');
    expect(screen.getByRole('header', { name: 'Pick spots' })).toBeOnTheScreen();
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes.map((b) => b.props.accessibilityLabel)).toEqual(['Pier 57, Capitol Hill', 'Untitled, Fremont', 'Red ledge']);
    expect(boxes.every((b) => b.props.accessibilityState.checked)).toBe(true);
    expect(screen.getByRole('button', { name: 'Save (3)' })).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('checkbox', { name: 'Untitled, Fremont' }));
    await press('Save (2)');

    expect(saveSend).toHaveBeenCalledWith(db, mockFake, ME, SEND, { spotIds: ['s-1', 's-3'] });
    expect(screen.queryByRole('header', { name: 'Pick spots' })).toBeNull();
    expect(screen.getByText('Saved 3 spots')).toBeOnTheScreen();
  });

  it("the picker's Save is disabled with nothing checked, and Cancel closes it without saving", async () => {
    signIn([SEND]);
    await renderTab();

    await press('Pick spots');
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

    await press('Dismiss');
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

    await press('Dismiss');
    await pressAlertButton('Cancel');
    expect(dismissSend).not.toHaveBeenCalled();

    await press('Dismiss');
    await pressAlertButton('Dismiss');
    expect(alert).toHaveBeenLastCalledWith("Couldn't reach the server", 'Try again.');
    expect(screen.getByText('@ana sent you 3 spots')).toBeOnTheScreen();
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
