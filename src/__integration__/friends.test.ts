/**
 * Friends against the local stack (S6-05, docs/plans/2026-10-22-s6-friends.md "Integration test design"): three
 * riders (ana, ben, cal), each with a real session and a node:sqlite phone for the names mirror, run src/sync/friends
 * the way the screens do: a request by username, accept, both sides see each other, a block hides the blocker and
 * stops a new request, remove and unblock. Needs the stack: npm run db:start, then npm run test:integration.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getProfiles } from '@/src/db/profiles';
import { setSyncState } from '@/src/db/sync';
import { SIGNED_OUT, useAuthStore } from '@/src/stores/auth-store';
import { useFriendsStore } from '@/src/stores/friends-store';
import { useInboxStore } from '@/src/stores/inbox-store';
import {
  addFriend,
  block,
  loadAndApplyFriends,
  loadFriends,
  removeFriend,
  respond,
  unblock,
  type FriendsData,
} from '@/src/sync/friends';
import { runExclusive } from '@/src/sync/queue';
import { createMigratedTestDb } from '@/src/__tests__/helpers/node-sqlite-db';

import { createRider, deleteRider, uniqueUsername, type Rider } from './helpers';

/** A rider and their phone: the phone's account is theirs (sync_state.user_id), as after adoption. */
type Phone = Rider & { db: SQLiteDatabase };

async function phone(name: string): Promise<Phone> {
  const rider = await createRider(uniqueUsername(name));
  riders.push(rider.userId);
  const db = await createMigratedTestDb();
  await setSyncState(db, 'user_id', rider.userId);
  return { ...rider, db };
}

/** loadFriends for a rider who is signed in (null would mean the session is gone). */
async function friendsOf(p: Phone): Promise<FriendsData> {
  const data = await loadFriends(p.client, p.userId);
  if (!data) throw new Error(`${p.username} has no session`);
  return data;
}

const ids = (rows: { profile: { id: string } }[]) => rows.map((r) => r.profile.id).sort();

/** Waits for everything on the sync queue (addFriend mirrors the name it found there). */
const settle = () => runExclusive(async () => {});

/** The profile rows `p` may read for `id` (RLS decides). */
async function readableProfile(client: SupabaseClient, id: string) {
  const { data, error } = await client.from('profiles').select('id,username').eq('id', id);
  if (error) throw error;
  return data;
}

/** Shows `p` as the signed-in rider, as useAuthInit does, so the stores take their loads. */
function signInStores(p: Phone) {
  useAuthStore.setState({ ...SIGNED_OUT, status: 'signed_in', userId: p.userId, username: p.username });
}

const riders: string[] = [];

afterAll(async () => {
  useAuthStore.setState(SIGNED_OUT);
  for (const userId of riders) await deleteRider(userId);
});

describe('friends end to end', () => {
  let ana: Phone;
  let ben: Phone;
  let cal: Phone;

  beforeAll(async () => {
    ana = await phone('ana');
    ben = await phone('ben');
    cal = await phone('cal');
  });

  it("ana's 'BEN' finds ben whatever the case and leaves one pending request", async () => {
    const result = await addFriend(ana.client, ana.db, ana.userId, ` @${ben.username.toUpperCase()} `);
    expect(result).toEqual({
      found: true,
      status: 'sent',
      profile: expect.objectContaining({ id: ben.userId, username: ben.username }),
    });
    // the server matches whatever the case too (citext), not only the app's lowercasing
    expect((await ana.client.rpc('find_profile', { p_username: ben.username.toUpperCase() })).data).toEqual([
      expect.objectContaining({ id: ben.userId }),
    ]);

    const benSees = await friendsOf(ben);
    expect(benSees.friends).toEqual([]);
    expect(benSees.outgoing).toEqual([]);
    expect(benSees.incoming).toHaveLength(1);
    expect(benSees.incoming[0].profile).toEqual(expect.objectContaining({ id: ana.userId, username: ana.username }));

    const anaSees = await friendsOf(ana);
    expect(anaSees.incoming).toEqual([]);
    expect(ids(anaSees.outgoing)).toEqual([ben.userId]);
    // the asker can't read the target's row (it would follow a rename): the name comes from ana's own phone
    expect(anaSees.outgoing[0].profile.username).toBeNull();
    expect(anaSees.outgoing[0].friendshipId).toBe(benSees.incoming[0].friendshipId);
  });

  it("keeps ben's name on ana's phone and puts ana's request in ben's Inbox", async () => {
    await settle();
    expect((await getProfiles(ana.db, [ben.userId]))[ben.userId]?.username).toBe(ben.username);

    signInStores(ana);
    await loadAndApplyFriends(ana.db, ana.client, ana.userId);
    expect(useFriendsStore.getState().loadError).toBeNull();
    expect(useFriendsStore.getState().outgoing.map((r) => r.profile.username)).toEqual([ben.username]);

    signInStores(ben);
    await loadAndApplyFriends(ben.db, ben.client, ben.userId);
    const items = useInboxStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual(
      expect.objectContaining({ kind: 'friend_request', from: expect.objectContaining({ username: ana.username }) }),
    );
  });

  it('ben accepts and each lists the other as a friend', async () => {
    const [request] = (await friendsOf(ben)).incoming;
    await respond(ben.client, ben.userId, request.friendshipId, 'accept');

    const benSees = await friendsOf(ben);
    const anaSees = await friendsOf(ana);
    expect(ids(benSees.friends)).toEqual([ana.userId]);
    expect(benSees.friends[0].profile.username).toBe(ana.username);
    expect(ids(anaSees.friends)).toEqual([ben.userId]);
    expect(anaSees.friends[0].profile.username).toBe(ben.username);
    for (const seen of [benSees, anaSees]) {
      expect(seen.incoming).toEqual([]);
      expect(seen.outgoing).toEqual([]);
    }
  });

  it('a block by cal ends the friendship, hides cal from ana and stops her asking again', async () => {
    expect(await addFriend(ana.client, ana.db, ana.userId, cal.username)).toEqual(
      expect.objectContaining({ found: true, status: 'sent' }),
    );
    const [request] = (await friendsOf(cal)).incoming;
    await respond(cal.client, cal.userId, request.friendshipId, 'accept');
    // control: as friends ana reads cal's profile and lists her
    expect(await readableProfile(ana.client, cal.userId)).toEqual([{ id: cal.userId, username: cal.username }]);
    expect(ids((await friendsOf(ana)).friends)).toEqual([ben.userId, cal.userId].sort());

    await block(cal.client, cal.userId, ana.userId);

    const anaSees = await friendsOf(ana);
    expect(ids(anaSees.friends)).toEqual([ben.userId]);
    expect(anaSees.incoming).toEqual([]);
    expect(anaSees.outgoing).toEqual([]);
    expect(anaSees.blocked).toEqual([]);
    const calSees = await friendsOf(cal);
    expect(calSees.friends).toEqual([]);
    expect(calSees.blocked.map((p) => p.id)).toEqual([ana.userId]);

    expect(await readableProfile(ana.client, cal.userId)).toEqual([]);
    // cal's name vanishes from find for ana only
    expect((await ana.client.rpc('find_profile', { p_username: cal.username })).data).toEqual([]);
    expect((await ben.client.rpc('find_profile', { p_username: cal.username })).data).toEqual([
      expect.objectContaining({ id: cal.userId }),
    ]);
    expect(await addFriend(ana.client, ana.db, ana.userId, cal.username)).toEqual({
      found: false,
      status: 'not_found',
    });
    // the server refuses it too, with the same answer as a name nobody has (D50: ana isn't told)
    const direct = await ana.client.rpc('send_friend_request', { p_username: cal.username });
    const nobody = await ana.client.rpc('send_friend_request', { p_username: uniqueUsername('nobody') });
    expect(direct.error?.code).toBe('P0002');
    expect(direct.error?.message).toBe(nobody.error?.message);
    expect(ids((await friendsOf(cal)).incoming)).toEqual([]);
  });

  it("finds no rider for a name nobody has, and 'self' for your own", async () => {
    expect(await addFriend(ben.client, ben.db, ben.userId, uniqueUsername('nobody'))).toEqual({
      found: false,
      status: 'not_found',
    });
    expect(await addFriend(ben.client, ben.db, ben.userId, ben.username)).toEqual(
      expect.objectContaining({ found: true, status: 'self' }),
    );
    expect(ids((await friendsOf(ben)).outgoing)).toEqual([]);
  });

  it('ben removes ana, and once cal unblocks her ana can ask cal again', async () => {
    const [friendship] = (await friendsOf(ben)).friends;
    await removeFriend(ben.client, ben.userId, friendship.friendshipId);
    expect((await friendsOf(ben)).friends).toEqual([]);
    expect((await friendsOf(ana)).friends).toEqual([]);

    await unblock(cal.client, cal.userId, ana.userId);
    expect((await friendsOf(cal)).blocked).toEqual([]);
    expect(await addFriend(ana.client, ana.db, ana.userId, cal.username)).toEqual(
      expect.objectContaining({ found: true, status: 'sent' }),
    );
    expect(ids((await friendsOf(cal)).incoming)).toEqual([ana.userId]);
  });
});
