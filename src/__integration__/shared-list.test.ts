/**
 * Shared hit lists against the local stack (S8-07, docs/plans/2026-10-22-s8-shared-lists.md "Integration test
 * design"): riders A, B and C are friends, each with a real session, a node:sqlite phone and a photo folder on disk,
 * and run src/sync/lists the way the Share sheet, the Inbox and the members screen do. Share = live: a member sees the
 * list's spots and the ones added later; a view-only member can't add; leaving (or the owner stopping sharing) takes
 * the list and its spots off the phone, and their photos stop downloading. Every refusal here is the server's (RLS),
 * not the app's. Needs the stack: npm run db:start, then npm run test:integration.
 *
 * The cases run in order and share module state (cachedPhotoUri's in-flight downloads by media id, its cache
 * generation, the zustand stores every reload fills from whichever rider's DB): keep the riders' calls sequential.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { SQLiteDatabase } from 'expo-sqlite';
import { Directory, Paths } from 'expo-file-system';

import { addSpotsToList, getAllMedia, getHitLists, getSpots, insertHitList, insertMedia, insertSpot } from '@/src/db';
import { getMembers } from '@/src/db/hit-lists';
import { setSyncState } from '@/src/db/sync';
import { selectSharedWithMe } from '@/src/stores/hit-lists-store';
import { addFriend, loadFriends, removeFriend, respond } from '@/src/sync/friends';
import { invite, leave, loadInvites, removeMember, respondInvite, shareList, stopSharing } from '@/src/sync/lists';
import { cachedPhotoUri, type PhotoIO } from '@/src/sync/photos';
import { push } from '@/src/sync/push';
import { runExclusive } from '@/src/sync/queue';
import { createMigratedTestDb } from '@/src/__tests__/helpers/node-sqlite-db';
import { fakeFs } from '@/src/__tests__/helpers/fake-fs';
import { FeatureType, type HitList, type Media, type Spot } from '@/src/types';
import { newId } from '@/src/utils/id';

import { createRider, deleteRiderAndPhotos, uniqueUsername, type Rider } from './helpers';
import { FIXTURE, nodePhotoIO, pullAll, pushAll } from './phones';

// lists.ts reaches the app's client module through its imports, which need React Native; these tests hand their own
// clients to every call, so the app client is never used.
jest.mock('@/src/sync/client', () => ({ getSupabase: () => null, isConfigured: () => false }));
// photos.ts imports the manipulator for preparePhoto, which nodePhotoIO replaces (no native module in Node).
jest.mock('expo-image-manipulator', () => ({}));
// newId is expo-crypto's native randomUUID on the phone; Node's crypto here.
jest.mock('expo-crypto', () => {
  const nodeCrypto = jest.requireActual<typeof import('node:crypto')>('node:crypto');
  return { randomUUID: () => nodeCrypto.randomUUID() };
});

/** A rider and their phone: the phone's account is theirs (sync_state.user_id), as after adoption. */
type Phone = Rider & { db: SQLiteDatabase; io: PhotoIO; dir: string };

const riders: { email: string; userId: string }[] = [];
const tempDirs: string[] = [];

/** What storage answers a rider who may not read an object (RLS hides it: 'Object not found' / 400). */
const STORAGE_REFUSED = /not found|denied|400|403/i;

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'hl-share-'));
  tempDirs.push(dir);
  return dir;
}

async function newPhone(name: string): Promise<Phone> {
  const rider = await createRider(uniqueUsername(name));
  riders.push({ email: rider.email, userId: rider.userId });
  const dir = tempDir();
  const db = await createMigratedTestDb();
  await setSyncState(db, 'user_id', rider.userId);
  return { ...rider, db, io: nodePhotoIO(dir), dir };
}

/** `from` asks `to` by username and `to` accepts, as on the Friends screen. */
async function befriend(from: Phone, to: Phone): Promise<void> {
  expect(await addFriend(from.client, from.db, from.userId, to.username)).toEqual(
    expect.objectContaining({ found: true, status: 'sent' }),
  );
  const incoming = (await loadFriends(to.client, to.userId))!.incoming;
  const request = incoming.find((r) => r.profile.id === from.userId)!;
  await respond(to.client, to.userId, request.friendshipId, 'accept');
  // addFriend mirrors the name on the sync queue
  await runExclusive(async () => {});
}

const now = () => new Date().toISOString();

/** An owned spot with one fixture photo, as Quick Add leaves it. */
async function spotWithPhoto(p: Phone, name: string): Promise<Spot> {
  const at = now();
  const spot: Spot = {
    id: newId(),
    name,
    location: { latitude: 47.6062, longitude: -122.3321 },
    created_at: at,
    updated_at: at,
    feature_types: [FeatureType.Rail],
    stopped: false,
    natural_speed: 2,
    owner_id: p.userId,
  };
  await insertSpot(p.db, spot);
  const mediaId = newId();
  const filePath = `photos/${spot.id}/${mediaId}.jpg`;
  p.io.write(filePath, FIXTURE);
  await insertMedia(p.db, { id: mediaId, spot_id: spot.id, file_path: filePath, created_at: at });
  return spot;
}

/** A manual list of the rider's, holding `spots` (added by the rider, as the Add-to-list sheet does). */
async function listWith(p: Phone, name: string, spots: Spot[]): Promise<HitList> {
  const at = now();
  const list: HitList = { id: newId(), name, kind: 'manual', shared: false, owner_id: p.userId, created_at: at, updated_at: at };
  await insertHitList(p.db, list);
  await addSpotsToList(p.db, list.id, spots.map((s) => s.id), at, p.userId);
  return list;
}

/** The ids of `owner`'s live spots on the phone. */
async function spotsOf(p: Phone, owner: Phone): Promise<string[]> {
  return (await getSpots(p.db)).filter((s) => s.owner_id === owner.userId).map((s) => s.id).sort();
}

/** The spot ids `listId` holds on the phone (memberships), sorted. */
async function listSpots(p: Phone, listId: string): Promise<string[]> {
  const rows = await p.db.getAllAsync<{ spot_id: string }>(
    'SELECT spot_id FROM hit_list_spots WHERE list_id = ? ORDER BY spot_id',
    listId,
  );
  return rows.map((r) => r.spot_id);
}

const ids = (spots: Spot[]) => spots.map((s) => s.id).sort();

/** The rider's open invitations (a null would mean the session is gone). */
async function invitationsOf(p: Phone) {
  const items = await loadInvites(p.client, p.userId);
  if (!items) throw new Error(`${p.username} has no session`);
  return items;
}

/** Joins as the Inbox's Join does (respondInvite, then a sync: here a pull, the engine needs the app's stores). */
async function joinList(p: Phone, listId: string): Promise<void> {
  expect(await respondInvite(p.db, p.client, p.userId, listId, 'join')).toBe(true);
  await pullAll(p.db, p.client, p.userId);
}

afterAll(async () => {
  for (const rider of riders) await deleteRiderAndPhotos(rider.email, rider.userId);
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe('A shares a list with B (can add) and C (view only)', () => {
  let a: Phone;
  let b: Phone;
  let c: Phone;
  let first5: Spot[];
  let oldSpot: Spot;
  let sixth: Spot;
  let bSpot: Spot;
  let cSpot: Spot;
  let list: HitList;
  /** One of A's photos as B's phone held it before leaving (for the download after Leave). */
  let aMediaOnB: Media;
  /** Where B's phone cached that photo (Paths.cache/photos/<spot>/<media>.jpg). */
  let cachedUri: string;

  beforeAll(async () => {
    [a, b, c] = await Promise.all([newPhone('ana'), newPhone('ben'), newPhone('cal')]);
    await befriend(a, b);
    await befriend(a, c);
    await befriend(b, c);
    first5 = [];
    for (let i = 1; i <= 5; i += 1) first5.push(await spotWithPhoto(a, `Rail ${i}`));
    // pushed before L is shared and never in it: B's spots cursor passes its rev while B can't read it
    oldSpot = await spotWithPhoto(a, 'Old ledge');
    list = await listWith(a, 'Downtown', first5);
    await pushAll(a.db, a.client, a.userId, a.io);
  });

  it('shares L: B and C each get one invitation with the 5 spots counted, and no spot yet (D83)', async () => {
    expect(await shareList(a.db, a.client, a.userId, list.id, [b.userId], 'add')).toBe(true);
    expect(await invite(a.db, a.client, a.userId, list.id, [c.userId], 'view')).toBe(true);
    expect((await getHitLists(a.db)).find((l) => l.id === list.id)?.shared).toBe(true);

    for (const p of [b, c]) {
      await pullAll(p.db, p.client, p.userId);
      const invites = await invitationsOf(p);
      expect(invites).toEqual([
        expect.objectContaining({
          kind: 'invite',
          listId: list.id,
          listName: 'Downtown',
          spotCount: 5,
          role: p === b ? 'add' : 'view',
          from: expect.objectContaining({ id: a.userId, username: a.username }),
        }),
      ]);
      // invited, not joined: no list and none of A's spots on the phone
      expect((await getHitLists(p.db)).map((l) => l.id)).not.toContain(list.id);
      expect(await spotsOf(p, a)).toEqual([]);
    }
  });

  it('after Join, B holds L as shared with them, its 5 spots as A\'s, and a photo downloads into the cache', async () => {
    await joinList(b, list.id);
    await joinList(c, list.id);
    expect(await invitationsOf(b)).toEqual([]);
    // C is a joined member, view only: case 5's refusal is about the role, not a missing join
    expect(await getMembers(c.db, list.id)).toContainEqual(
      expect.objectContaining({ user_id: c.userId, role: 'view', status: 'member' }),
    );

    const shared = selectSharedWithMe(await getHitLists(b.db), b.userId);
    expect(shared.map((l) => [l.id, l.name, l.owner_id])).toEqual([[list.id, 'Downtown', a.userId]]);
    expect(await spotsOf(b, a)).toEqual(ids(first5));
    expect(await listSpots(b, list.id)).toEqual(ids(first5));

    const media = (await getAllMedia(b.db)).filter((m) => m.spot_id === first5[0].id);
    expect(media).toHaveLength(1);
    aMediaOnB = media[0];
    expect(aMediaOnB.file_path).toBe(`cache/photos/${first5[0].id}/${aMediaOnB.id}.jpg`);
    // the app's own IO: the file lands in Paths.cache (the in-memory expo-file-system fake here), as on the phone
    cachedUri = await cachedPhotoUri(b.client, aMediaOnB);
    expect(cachedUri).toBe(`${Paths.cache.uri}photos/${first5[0].id}/${aMediaOnB.id}.jpg`);
    expect(fakeFs.__fileBytes(cachedUri)).toEqual(FIXTURE);
  });

  it('a 6th spot A adds later reaches B, and so does an old spot A files into L (the fill)', async () => {
    sixth = await spotWithPhoto(a, 'Rail 6');
    await addSpotsToList(a.db, list.id, [sixth.id], now(), a.userId);
    await pushAll(a.db, a.client, a.userId, a.io);
    await pullAll(b.db, b.client, b.userId);
    expect(await spotsOf(b, a)).toEqual(ids([...first5, sixth]));
    expect(await listSpots(b, list.id)).toEqual(ids([...first5, sixth]));

    await addSpotsToList(a.db, list.id, [oldSpot.id], now(), a.userId);
    await pushAll(a.db, a.client, a.userId, a.io);
    await pullAll(b.db, b.client, b.userId);
    expect(await spotsOf(b, a)).toEqual(ids([...first5, sixth, oldSpot]));
    expect(await listSpots(b, list.id)).toEqual(ids([...first5, sixth, oldSpot]));
  });

  it('B (can add) files a spot of their own into L: the push succeeds and A reads it', async () => {
    bSpot = await spotWithPhoto(b, "Ben's bank");
    await addSpotsToList(b.db, list.id, [bSpot.id], now(), b.userId);
    expect(await b.db.getAllAsync("SELECT entity_id FROM sync_outbox WHERE entity = 'hit_list_spot'")).toEqual([
      { entity_id: `${list.id}/${bSpot.id}` },
    ]);
    await pushAll(b.db, b.client, b.userId, b.io);

    await pullAll(a.db, a.client, a.userId);
    expect(await spotsOf(a, b)).toEqual([bSpot.id]);
    expect(await listSpots(a, list.id)).toContain(bSpot.id);
  });

  it("C (view only) can't: the server refuses the membership and C's outbox row records it", async () => {
    cSpot = await spotWithPhoto(c, "Cal's gap");
    await addSpotsToList(c.db, list.id, [cSpot.id], now(), c.userId);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect((await push(c.db, c.client, c.userId, c.io)).failed).toBe(1);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('set aside'), 'not a member who can add to this list');
    } finally {
      warn.mockRestore();
    }
    const rows = await c.db.getAllAsync<{ entity: string; entity_id: string; parked: number; last_error: string }>(
      'SELECT entity, entity_id, parked, last_error FROM sync_outbox',
    );
    expect(rows).toEqual([
      {
        entity: 'hit_list_spot',
        entity_id: `${list.id}/${cSpot.id}`,
        parked: 1,
        last_error: 'not a member who can add to this list',
      },
    ]);
    // the refusal is the server's (lock_adder_membership, errcode 42501, re-checking the role); C's own spot went up
    // and the server's L never holds it
    const { data, error } = await a.client.from('hit_list_spots').select('spot_id').eq('list_id', list.id);
    expect(error).toBeNull();
    expect((data ?? []).map((r) => r.spot_id)).not.toContain(cSpot.id);

    // the next pull confirms the server hasn't got it: the membership and its parked row go
    await pullAll(c.db, c.client, c.userId);
    expect(await listSpots(c, list.id)).not.toContain(cSpot.id);
    expect(await c.db.getAllAsync('SELECT id FROM sync_outbox')).toEqual([]);
  });

  it("B leaves: L and A's spots are gone from B's phone, the cache folders too, and A's photos refuse B", async () => {
    expect(fakeFs.__fileExists(cachedUri)).toBe(true);
    expect(await leave(b.db, b.client, b.userId, list.id)).toBe(true);

    expect((await getHitLists(b.db)).map((l) => l.id)).not.toContain(list.id);
    expect(await spotsOf(b, a)).toEqual([]);
    expect((await getAllMedia(b.db)).filter((m) => m.owner_id === a.userId)).toEqual([]);
    expect(await b.db.getAllAsync('SELECT * FROM hit_list_members WHERE list_id = ?', list.id)).toEqual([]);
    // the photo case 2 downloaded went with its spot's cache folder
    expect(fakeFs.__fileExists(cachedUri)).toBe(false);
    expect(new Directory(Paths.cache, 'photos', first5[0].id).exists).toBe(false);
    // and the server took B's spot out of L (D43)
    const { data } = await a.client.from('hit_list_spots').select('spot_id').eq('list_id', list.id);
    expect((data ?? []).map((r) => r.spot_id).sort()).toEqual(ids([...first5, sixth, oldSpot]));
    // B's own spot stays B's
    expect(await spotsOf(b, b)).toEqual([bSpot.id]);

    // the next pull doesn't bring any of it back
    await pullAll(b.db, b.client, b.userId);
    expect((await getHitLists(b.db)).map((l) => l.id)).not.toContain(list.id);
    expect(await spotsOf(b, a)).toEqual([]);

    // a photo row still held somewhere (a stale screen) downloads nothing now: storage RLS refuses B, while C, still
    // a member, downloads the same object (so it exists and the path is right)
    const forC = nodePhotoIO(tempDir());
    await cachedPhotoUri(c.client, aMediaOnB, forC);
    expect(forC.exists(aMediaOnB.file_path)).toBe(true);
    await expect(cachedPhotoUri(b.client, aMediaOnB)).rejects.toThrow(STORAGE_REFUSED);
    expect(fakeFs.__fileExists(cachedUri)).toBe(false);
  });

  it("A's and C's next pulls show B's spot gone from L (D43), and B's spot itself off both phones", async () => {
    expect(await listSpots(a, list.id)).toContain(bSpot.id);
    expect(await spotsOf(c, b)).toEqual([bSpot.id]);
    await pullAll(c.db, c.client, c.userId);
    expect(await listSpots(c, list.id)).toEqual(ids([...first5, sixth, oldSpot]));
    expect(await spotsOf(c, b)).toEqual([]);

    await pullAll(a.db, a.client, a.userId);
    expect(await listSpots(a, list.id)).toEqual(ids([...first5, sixth, oldSpot]));
    expect(await spotsOf(a, b)).toEqual([]);
  });

  it("A stops sharing: C's next pull takes L and A's spots off C's phone", async () => {
    expect(await spotsOf(c, a)).toEqual(ids([...first5, sixth, oldSpot]));
    expect(await stopSharing(a.db, a.client, a.userId, list.id)).toBe(true);
    expect((await getHitLists(a.db)).find((l) => l.id === list.id)?.shared).toBe(false);

    await pullAll(c.db, c.client, c.userId);
    expect((await getHitLists(c.db)).map((l) => l.id)).not.toContain(list.id);
    expect(await spotsOf(c, a)).toEqual([]);
    expect((await getAllMedia(c.db)).filter((m) => m.owner_id === a.userId)).toEqual([]);
    expect(await spotsOf(c, c)).toEqual([cSpot.id]);
    expect(await getMembers(c.db, list.id)).toEqual([]);
    // and the server agrees: C reads none of A's spots any more
    const { data, error } = await c.client.from('spots').select('id').eq('id', first5[0].id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
    // A keeps every spot of A's own in L
    expect(await listSpots(a, list.id)).toEqual(ids([...first5, sixth, oldSpot]));
  });
});

describe('A removes a member, and an unfriended invitee loses the invitation', () => {
  let a: Phone;
  let b: Phone;
  let c: Phone;
  let aSpot: Spot;
  let bSpot: Spot;
  let list: HitList;

  beforeAll(async () => {
    [a, b, c] = await Promise.all([newPhone('ana'), newPhone('ben'), newPhone('cal')]);
    await befriend(a, b);
    await befriend(a, c);
    aSpot = await spotWithPhoto(a, 'Rail');
    list = await listWith(a, 'Crew', [aSpot]);
    await pushAll(a.db, a.client, a.userId, a.io);
    expect(await shareList(a.db, a.client, a.userId, list.id, [b.userId, c.userId], 'add')).toBe(true);
    await joinList(b, list.id);
    bSpot = await spotWithPhoto(b, "Ben's ledge");
    await addSpotsToList(b.db, list.id, [bSpot.id], now(), b.userId);
    await pushAll(b.db, b.client, b.userId, b.io);
    await pullAll(a.db, a.client, a.userId);
    expect(await listSpots(a, list.id)).toEqual(ids([aSpot, bSpot]));
  });

  it("removing B takes B's spot out of L on A's phone at once and on the server (D43); B's pull drops L", async () => {
    expect(await removeMember(a.db, a.client, a.userId, list.id, b.userId)).toBe(true);
    expect(await listSpots(a, list.id)).toEqual([aSpot.id]);
    const { data } = await a.client.from('hit_list_spots').select('spot_id').eq('list_id', list.id);
    expect((data ?? []).map((r) => r.spot_id)).toEqual([aSpot.id]);

    await pullAll(b.db, b.client, b.userId);
    expect((await getHitLists(b.db)).map((l) => l.id)).not.toContain(list.id);
    expect(await spotsOf(b, a)).toEqual([]);
    expect(await spotsOf(b, b)).toEqual([bSpot.id]);
  });

  it('C, invited and not joined, loses the invitation when A removes the friendship', async () => {
    expect((await invitationsOf(c)).map((i) => i.listId)).toEqual([list.id]);
    const friendship = (await loadFriends(a.client, a.userId))!.friends.find((f) => f.profile.id === c.userId)!;
    await removeFriend(a.client, a.userId, friendship.friendshipId);
    expect(await invitationsOf(c)).toEqual([]);
    await expect(respondInvite(c.db, c.client, c.userId, list.id, 'join')).rejects.toThrow(
      'This invitation was withdrawn.',
    );
  });
});
