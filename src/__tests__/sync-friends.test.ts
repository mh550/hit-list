// src/sync/friends.ts (S6-02, docs/plans/2026-10-22-s6-friends.md "Data"): the friends calls against the fake client,
// the local profiles mirror in real SQLite.
import type { SQLiteDatabase } from 'expo-sqlite';
import { createMigratedTestDb } from './helpers/node-sqlite-db';
import { createFakeSupabase, fakeSession, type FakeSupabase } from './helpers/fake-supabase';
import { ME, adoptPhoneFor } from './helpers/outbox';

import { getProfiles, upsertProfiles } from '@/src/db/profiles';
import { setSyncState } from '@/src/db/sync';
import {
  addFriend,
  block,
  loadFriends,
  normaliseUsername,
  refreshFriends,
  removeFriend,
  respond,
  unblock,
} from '@/src/sync/friends';
import { SIGNED_OUT, useAuthStore } from '@/src/stores/auth-store';
import { EMPTY_FRIENDS, useFriendsStore } from '@/src/stores/friends-store';
import type { SupabaseClient } from '@supabase/supabase-js';

// ids sort like the server's uuids: user_a is the smaller of the pair
const ANA = 'rider-ana'; // < ME
const CAL = 'rider-cal'; // < ME
const DEE = 'rider-dee'; // < ME
const ZED = 'rider-zed'; // > ME

let db: SQLiteDatabase;
let fake: FakeSupabase;
const client = () => fake as unknown as SupabaseClient;

const pair = (a: string, b: string) => (a < b ? { user_a: a, user_b: b } : { user_a: b, user_b: a });
const friendship = (
  id: string,
  other: string,
  status: 'pending' | 'accepted',
  requestedBy: string,
  createdAt = '2026-10-20 10:00:00+00',
) => ({ id, ...pair(ME, other), status, requested_by: requestedBy, created_at: createdAt });
const profile = (id: string, username: string | null, display_name: string | null = null) => ({
  id,
  username,
  display_name,
});

/** find_profile answers a table: the one rider with that exact (citext) name, [] for none. */
function serverRiders(riders: { id: string; username: string; display_name: string | null }[]) {
  for (const r of riders) fake.profiles.set(r.id, { username: r.username, display_name: r.display_name });
  fake.rpcHandlers.find_profile = (args) => ({
    data: riders.filter((r) => r.username === String(args?.p_username).toLowerCase()),
    error: null,
  });
}

const rpcNames = () => fake.rpcs.map((r) => r.fn);

beforeEach(async () => {
  db = await createMigratedTestDb();
  await adoptPhoneFor(db, ME);
  fake = createFakeSupabase({ session: fakeSession({ userId: ME }) });
  fake.tables.friendships = [];
  fake.tables.blocks = [];
  useAuthStore.setState({ ...SIGNED_OUT, status: 'signed_in', userId: ME, username: 'me' });
  useFriendsStore.getState().clearFriends();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('normaliseUsername', () => {
  it('trims, drops one leading @ and lowercases', () => {
    expect(normaliseUsername('  @Ana ')).toBe('ana');
    expect(normaliseUsername('Ben_B.2')).toBe('ben_b.2');
  });

  it('is null for a name outside ^[a-z0-9_.]{3,20}$ (D39)', () => {
    expect(normaliseUsername('a b')).toBeNull();
    expect(normaliseUsername('ab')).toBeNull();
    expect(normaliseUsername('@@ana')).toBeNull();
    expect(normaliseUsername('a'.repeat(21))).toBeNull();
    expect(normaliseUsername('')).toBeNull();
  });
});

describe('loadFriends', () => {
  beforeEach(() => {
    fake.tables.friendships = [
      friendship('f-ana', ANA, 'accepted', ME, '2026-10-19 09:00:00+00'),
      friendship('f-zed', ZED, 'pending', ZED, '2026-10-21 10:00:00.123456+00'),
      friendship('f-cal', CAL, 'pending', ME, '2026-10-20 08:00:00+00'),
    ];
    fake.tables.blocks = [{ blocker: ME, blocked: DEE, created_at: '2026-10-18 00:00:00+00' }];
    fake.profiles.set(ANA, { username: 'ana', display_name: 'Ana B' });
    fake.profiles.set(ZED, { username: 'zed', display_name: null });
    fake.profiles.set(CAL, { username: 'cal', display_name: null });
    fake.profiles.set(DEE, { username: 'dee', display_name: null });
    // RLS: friends and riders who asked you; not the target of your request, not a rider you blocked
    fake.readableProfiles = new Set([ME, ANA, ZED]);
  });

  it('maps accepted rows to friends, pending by others to incoming, by me to outgoing, blocks to blocked', async () => {
    const data = await loadFriends(client(), ME);

    expect(data).toEqual({
      friends: [{ friendshipId: 'f-ana', created_at: '2026-10-19T09:00:00.000Z', profile: profile(ANA, 'ana', 'Ana B') }],
      incoming: [{ friendshipId: 'f-zed', created_at: '2026-10-21T10:00:00.123Z', profile: profile(ZED, 'zed') }],
      // the target of a sent request is not readable: its name comes from the mirror (refreshFriends)
      outgoing: [{ friendshipId: 'f-cal', created_at: '2026-10-20T08:00:00.000Z', profile: profile(CAL, null) }],
      blocked: [profile(DEE, null)],
    });
  });

  it('sorts friends by username and requests newest first', async () => {
    const BEN = 'rider-ben';
    const AMY = 'rider-amy';
    fake.tables.friendships.push(
      friendship('f-ben', BEN, 'accepted', BEN),
      friendship('f-amy', AMY, 'pending', AMY, '2026-10-22 10:00:00+00'),
    );
    fake.profiles.set(BEN, { username: 'aaron', display_name: null });
    fake.profiles.set(AMY, { username: 'amy', display_name: null });
    fake.readableProfiles = new Set([ME, ANA, ZED, BEN, AMY]);

    const data = await loadFriends(client(), ME);

    expect(data!.friends.map((f) => f.profile.username)).toEqual(['aaron', 'ana']);
    expect(data!.incoming.map((f) => f.friendshipId)).toEqual(['f-amy', 'f-zed']);
  });

  it('asks profiles only by id (.in), for the other side of its own rows, never the whole table', async () => {
    await loadFriends(client(), ME);

    const profileSelects = fake.selects.filter((s) => s.table === 'profiles');
    expect(profileSelects.length).toBeGreaterThan(0);
    for (const select of profileSelects) {
      expect(select.filters).toEqual([['in', 'id', expect.any(Array)]]);
    }
    const asked = profileSelects.flatMap((s) => s.filters[0][2] as string[]).sort();
    expect(asked).toEqual([ANA, CAL, ZED]);
  });

  it('pages friendships by id: a full page of 500 asks for the next one', async () => {
    fake.tables.friendships = Array.from({ length: 501 }, (_, i) => {
      const other = `rider-x${String(i).padStart(3, '0')}`; // all < ME
      return friendship(`f${String(i).padStart(3, '0')}`, other, 'accepted', ME);
    });
    fake.readableProfiles = null;

    const data = await loadFriends(client(), ME);

    const pages = fake.selects.filter((s) => s.table === 'friendships');
    expect(pages.map((s) => s.limit)).toEqual([500, 500]);
    expect(pages[1].filters).toEqual([['gt', 'id', 'f499']]);
    expect(data!.friends).toHaveLength(501);
    // PostgREST URLs stay short: at most 100 ids per profiles select
    for (const s of fake.selects.filter((x) => x.table === 'profiles')) {
      expect((s.filters[0][2] as string[]).length).toBeLessThanOrEqual(100);
    }
  });

  it('throws when a table cannot be read (the caller keeps its last data)', async () => {
    fake.failSelect((s) => s.table === 'friendships', { message: 'offline' });

    await expect(loadFriends(client(), ME)).rejects.toThrow('offline');
  });

  it('with no session for the rider resolves null and asks nothing', async () => {
    fake.setSession(fakeSession({ userId: 'someone-else' }));

    expect(await loadFriends(client(), ME)).toBeNull();
    expect(fake.selects).toEqual([]);
  });
});

describe('addFriend', () => {
  beforeEach(() => {
    serverRiders([
      { id: ANA, username: 'ana', display_name: 'Ana B' },
      { id: ME, username: 'me', display_name: null },
    ]);
  });

  it("normalises '  @Ana ', finds the rider, sends the request and mirrors the profile", async () => {
    const result = await addFriend(client(), db, ME, '  @Ana ');

    expect(fake.rpcs).toEqual([
      { fn: 'find_profile', args: { p_username: 'ana' } },
      { fn: 'send_friend_request', args: { p_username: 'ana' } },
    ]);
    expect(result).toEqual({ found: true, status: 'sent', profile: profile(ANA, 'ana', 'Ana B') });
    expect(await getProfiles(db, [ANA])).toEqual({ [ANA]: profile(ANA, 'ana', 'Ana B') });
  });

  it('with no hit resolves { found: false } and sends nothing', async () => {
    const result = await addFriend(client(), db, ME, 'nobody');

    expect(result).toEqual({ found: false, status: 'not_found' });
    expect(rpcNames()).toEqual(['find_profile']);
  });

  it("maps send_friend_request's P0002 (they blocked you since) to the same not_found", async () => {
    fake.failNext('rpc', { message: 'user not found', code: 'P0002' }, 'send_friend_request');

    expect(await addFriend(client(), db, ME, 'ana')).toEqual({ found: false, status: 'not_found' });
  });

  it("maps send_friend_request's 42501 (you blocked them on another phone) to blocked_by_me", async () => {
    fake.failNext('rpc', { message: 'unblock this user first', code: '42501' }, 'send_friend_request');

    expect(await addFriend(client(), db, ME, 'ana')).toMatchObject({ found: true, status: 'blocked_by_me' });
  });

  it('throws on any other send error', async () => {
    fake.failNext('rpc', { message: 'offline' }, 'send_friend_request');

    await expect(addFriend(client(), db, ME, 'ana')).rejects.toThrow('offline');
  });

  it('throws when find_profile fails (not the same as not found)', async () => {
    fake.failNext('rpc', { message: 'offline' }, 'find_profile');

    await expect(addFriend(client(), db, ME, 'ana')).rejects.toThrow('offline');
  });

  it('already friends: already_friends and no send', async () => {
    fake.tables.friendships = [friendship('f-ana', ANA, 'accepted', ANA)];

    expect(await addFriend(client(), db, ME, 'ana')).toMatchObject({ found: true, status: 'already_friends' });
    expect(rpcNames()).toEqual(['find_profile']);
    expect(fake.selects.find((s) => s.table === 'friendships')!.filters).toEqual([
      ['eq', 'user_a', ANA],
      ['eq', 'user_b', ME],
    ]);
  });

  it('a request I already sent: already_sent and no send', async () => {
    fake.tables.friendships = [friendship('f-ana', ANA, 'pending', ME)];

    expect(await addFriend(client(), db, ME, 'ana')).toMatchObject({ found: true, status: 'already_sent' });
    expect(rpcNames()).toEqual(['find_profile']);
  });

  it('they had asked me: the send accepts it, status accepted', async () => {
    fake.tables.friendships = [friendship('f-ana', ANA, 'pending', ANA)];

    expect(await addFriend(client(), db, ME, 'ana')).toMatchObject({ found: true, status: 'accepted' });
    expect(rpcNames()).toEqual(['find_profile', 'send_friend_request']);
  });

  it("my own name: self, no send, nothing mirrored", async () => {
    expect(await addFriend(client(), db, ME, 'Me')).toMatchObject({ found: true, status: 'self' });
    expect(rpcNames()).toEqual(['find_profile']);
    expect(await getProfiles(db, [ME])).toEqual({});
  });

  it('a rider I blocked: blocked_by_me, no send', async () => {
    fake.tables.blocks = [{ blocker: ME, blocked: ANA, created_at: '2026-10-18 00:00:00+00' }];

    expect(await addFriend(client(), db, ME, 'ana')).toMatchObject({ found: true, status: 'blocked_by_me' });
    expect(rpcNames()).toEqual(['find_profile']);
  });

  it('an invalid name makes no call', async () => {
    expect(await addFriend(client(), db, ME, 'a b')).toEqual({ status: 'invalid' });
    expect(fake.rpcs).toEqual([]);
  });

  it('with no session for the rider resolves null and makes no call', async () => {
    fake.setSession(null);

    expect(await addFriend(client(), db, ME, 'ana')).toBeNull();
    expect(fake.rpcs).toEqual([]);
  });

  it("doesn't mirror the hit into a phone that holds another account's rows", async () => {
    await setSyncState(db, 'user_id', 'someone-else');

    await addFriend(client(), db, ME, 'ana');

    expect(await getProfiles(db, [ANA])).toEqual({});
  });
});

describe('respond, removeFriend, block, unblock', () => {
  it("respond calls respond_friend_request with { p_id, p_action }", async () => {
    await respond(client(), ME, 'f-zed', 'accept');
    await respond(client(), ME, 'f-amy', 'decline');

    expect(fake.rpcs).toEqual([
      { fn: 'respond_friend_request', args: { p_id: 'f-zed', p_action: 'accept' } },
      { fn: 'respond_friend_request', args: { p_id: 'f-amy', p_action: 'decline' } },
    ]);
  });

  it('respond resolves on 42501 (answered or withdrawn elsewhere) while still signed in', async () => {
    fake.failNext('rpc', { message: 'no friend request to answer', code: '42501' }, 'respond_friend_request');

    await expect(respond(client(), ME, 'f-zed', 'accept')).resolves.toBeUndefined();
  });

  it('respond throws on 42501 when the session is gone (that is "not signed in")', async () => {
    fake.rpcHandlers.respond_friend_request = () => {
      fake.setSession(null);
      return { data: null, error: { message: 'not signed in', code: '42501' } };
    };

    await expect(respond(client(), ME, 'f-zed', 'accept')).rejects.toThrow('not signed in');
  });

  it('respond throws on other errors', async () => {
    fake.failNext('rpc', { message: 'offline' }, 'respond_friend_request');

    await expect(respond(client(), ME, 'f-zed', 'accept')).rejects.toThrow('offline');
  });

  it('removeFriend deletes the friendships row by id (also Cancel of a sent request)', async () => {
    await removeFriend(client(), ME, 'f-ana');

    expect(fake.calls).toEqual([{ kind: 'delete', table: 'friendships', filters: [['id', 'f-ana']] }]);
  });

  it('removeFriend throws on an error', async () => {
    fake.failNext('delete', { message: 'offline' }, 'friendships');

    await expect(removeFriend(client(), ME, 'f-ana')).rejects.toThrow('offline');
  });

  it('block calls block_user with { p_user }; P0002 (they deleted their account) resolves', async () => {
    await block(client(), ME, ANA);
    fake.failNext('rpc', { message: 'user not found', code: 'P0002' }, 'block_user');
    await expect(block(client(), ME, CAL)).resolves.toBeUndefined();

    expect(fake.rpcs).toEqual([
      { fn: 'block_user', args: { p_user: ANA } },
      { fn: 'block_user', args: { p_user: CAL } },
    ]);
  });

  it('block throws on other errors', async () => {
    fake.failNext('rpc', { message: 'offline' }, 'block_user');

    await expect(block(client(), ME, ANA)).rejects.toThrow('offline');
  });

  it('unblock calls unblock_user with { p_user }', async () => {
    await unblock(client(), ME, DEE);

    expect(fake.rpcs).toEqual([{ fn: 'unblock_user', args: { p_user: DEE } }]);
  });

  it('with no session for the rider none of them calls the server', async () => {
    fake.setSession(null);

    await respond(client(), ME, 'f-zed', 'accept');
    await removeFriend(client(), ME, 'f-ana');
    await block(client(), ME, ANA);
    await unblock(client(), ME, DEE);

    expect(fake.rpcs).toEqual([]);
    expect(fake.calls).toEqual([]);
  });
});

describe('refreshFriends', () => {
  beforeEach(() => {
    fake.tables.friendships = [
      friendship('f-ana', ANA, 'accepted', ME),
      friendship('f-zed', ZED, 'pending', ZED),
      friendship('f-cal', CAL, 'pending', ME),
    ];
    fake.tables.blocks = [{ blocker: ME, blocked: DEE, created_at: '2026-10-18 00:00:00+00' }];
    fake.profiles.set(ANA, { username: 'ana', display_name: 'Ana B' });
    fake.profiles.set(ZED, { username: 'zed', display_name: null });
    fake.readableProfiles = new Set([ME, ANA, ZED]);
  });

  it('mirrors the profiles the server returned, so getProfiles(ids) has their usernames', async () => {
    await refreshFriends(db, client(), ME);

    expect(await getProfiles(db, [ANA, ZED, CAL, DEE])).toEqual({
      [ANA]: profile(ANA, 'ana', 'Ana B'),
      [ZED]: profile(ZED, 'zed'),
    });
  });

  it('fills the friends store, with the names of a sent request and a block from the mirror', async () => {
    // cal was typed into Add on this phone, dee was a friend once
    await upsertProfiles(db, [profile(CAL, 'cal', 'Cal C'), profile(DEE, 'dee')]);

    await refreshFriends(db, client(), ME);

    const s = useFriendsStore.getState();
    expect(s.userId).toBe(ME);
    expect(s.friends.map((f) => f.profile)).toEqual([profile(ANA, 'ana', 'Ana B')]);
    expect(s.incoming.map((f) => f.profile)).toEqual([profile(ZED, 'zed')]);
    expect(s.outgoing.map((f) => f.profile)).toEqual([profile(CAL, 'cal', 'Cal C')]);
    expect(s.blocked).toEqual([profile(DEE, 'dee')]);
    expect(s.loadedAt).toEqual(expect.any(String));
    expect(s.loadError).toBeNull();
  });

  it('a name it never knew stays null (the screen shows "A rider you asked", D73)', async () => {
    await refreshFriends(db, client(), ME);

    expect(useFriendsStore.getState().outgoing[0].profile).toEqual(profile(CAL, null));
  });

  it('never upserts the null placeholder of an unreadable row (a mirrored display name stays)', async () => {
    await upsertProfiles(db, [profile(CAL, 'cal', 'Cal C')]);

    await refreshFriends(db, client(), ME);

    expect((await getProfiles(db, [CAL]))[CAL]).toEqual(profile(CAL, 'cal', 'Cal C'));
  });

  it('an error warns, keeps the last data and records loadError', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await refreshFriends(db, client(), ME);
    const before = useFriendsStore.getState().friends;
    fake.failSelect((s) => s.table === 'blocks', { message: 'offline' });

    await expect(refreshFriends(db, client(), ME)).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[friends]'), 'offline');
    expect(useFriendsStore.getState().friends).toBe(before);
    expect(useFriendsStore.getState().loadError).toBe('offline');
  });

  it('a session that ends before the profiles answer writes no mirror row and leaves the store alone', async () => {
    const realFrom = fake.from.getMockImplementation()!;
    fake.from.mockImplementation((table: string) => {
      if (table === 'profiles') fake.setSession(null);
      return realFrom(table);
    });

    await refreshFriends(db, client(), ME);

    expect(await getProfiles(db, [ANA, ZED])).toEqual({});
    expect(useFriendsStore.getState()).toMatchObject(EMPTY_FRIENDS);
  });

  it('an account switch on the phone (sync_state.user_id) mid-load writes no mirror row', async () => {
    const realFrom = fake.from.getMockImplementation()!;
    fake.from.mockImplementation((table: string) => {
      if (table === 'profiles') void setSyncState(db, 'user_id', 'someone-else');
      return realFrom(table);
    });

    await refreshFriends(db, client(), ME);

    expect(await getProfiles(db, [ANA, ZED])).toEqual({});
    expect(useFriendsStore.getState()).toMatchObject(EMPTY_FRIENDS);
  });

  it('only the newest load applies: an older load that ends later never puts an answered request back', async () => {
    const seen: number[] = [];
    const unsubscribe = useFriendsStore.subscribe((s) => seen.push(s.incoming.length));
    fake.queryDelayMs = 1;

    const older = refreshFriends(db, client(), ME);
    while (!fake.selects.some((s) => s.table === 'friendships')) await new Promise((r) => setTimeout(r, 0));
    // the older load has read the pending request; then the rider accepts it and a newer load is asked for
    fake.tables.friendships[1] = friendship('f-zed', ZED, 'accepted', ZED);
    const newer = refreshFriends(db, client(), ME);
    await Promise.all([older, newer]);
    unsubscribe();

    expect(useFriendsStore.getState().incoming).toEqual([]);
    expect(useFriendsStore.getState().friends.map((f) => f.profile.id)).toEqual([ANA, ZED]);
    expect(seen).not.toContain(1);
  });

  it('with no session resolves and asks nothing', async () => {
    fake.setSession(null);

    await refreshFriends(db, client(), ME);

    expect(fake.selects).toEqual([]);
    expect(useFriendsStore.getState()).toMatchObject(EMPTY_FRIENDS);
  });
});
