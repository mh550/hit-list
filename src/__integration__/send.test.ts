/**
 * Send against the local stack (S7-06, docs/plans/2026-10-22-s7-send.md "Integration test design"): ana and ben are
 * friends, each with a real session, a node:sqlite phone and a photo folder on disk, and run src/sync/sends the way
 * the Send sheet, the Inbox and the Sent screen do. D40: what ana sent is what ben saves, whatever she changes later;
 * a withdrawn send is gone for ben, a saved one can't be withdrawn; staged photos are only their stager's (D77) and the
 * sender's name is the server's (D80). Needs the stack: npm run db:start, then npm run test:integration.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getAllMedia, getSpots, insertMedia, insertSpot, softDeleteSpot, updateSpot } from '@/src/db';
import { countPending, setSyncState } from '@/src/db/sync';
import type { SendItem } from '@/src/stores/inbox-store';
import { addFriend, loadFriends, removeFriend, respond } from '@/src/sync/friends';
import { storagePath, type PhotoIO } from '@/src/sync/photos';
import { runExclusive } from '@/src/sync/queue';
import { createSend, dismissSend, hasPendingSave, listSent, loadSends, saveSend, withdrawSend } from '@/src/sync/sends';
import { createMigratedTestDb } from '@/src/__tests__/helpers/node-sqlite-db';
import { FeatureType, type Spot } from '@/src/types';
import { newId } from '@/src/utils/id';

import { adminClient, createRider, deleteRiderAndPhotos, signInAgain, uniqueUsername, type Rider } from './helpers';
import { FIXTURE, nodePhotoIO, pullAll, sync } from './phones';

// sends.ts reaches the app's client module through friends.ts, which needs React Native; these tests hand their own
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

async function phoneFor(rider: Rider, client: SupabaseClient = rider.client): Promise<Phone> {
  const dir = mkdtempSync(join(tmpdir(), 'hl-send-'));
  tempDirs.push(dir);
  const db = await createMigratedTestDb();
  await setSyncState(db, 'user_id', rider.userId);
  return { ...rider, client, db, io: nodePhotoIO(dir), dir };
}

async function newPhone(name: string): Promise<Phone> {
  const rider = await createRider(uniqueUsername(name));
  riders.push({ email: rider.email, userId: rider.userId });
  return phoneFor(rider);
}

/** `from` asks `to` by username and `to` accepts, as on the Friends screen. */
async function befriend(from: Phone, to: Phone): Promise<void> {
  expect(await addFriend(from.client, from.db, from.userId, to.username)).toEqual(
    expect.objectContaining({ found: true, status: 'sent' }),
  );
  const incoming = (await loadFriends(to.client, to.userId))!.incoming;
  expect(incoming.map((r) => r.profile.id)).toEqual([from.userId]);
  await respond(to.client, to.userId, incoming[0].friendshipId, 'accept');
  // addFriend mirrors the name on the sync queue
  await runExclusive(async () => {});
}

const now = () => new Date().toISOString();

/** An owned spot with one fixture photo, as Quick Add leaves it. */
async function spotWithPhoto(p: Phone, name: string): Promise<{ spot: Spot; mediaId: string }> {
  const at = now();
  const spot: Spot = {
    id: newId(),
    name,
    location: { latitude: 47.6062, longitude: -122.3321 },
    created_at: at,
    updated_at: at,
    feature_types: [FeatureType.Rail],
    stopped: false,
    natural_speed: 0,
    owner_id: p.userId,
  };
  await insertSpot(p.db, spot);
  const mediaId = newId();
  const filePath = `photos/${spot.id}/${mediaId}.jpg`;
  p.io.write(filePath, FIXTURE);
  await insertMedia(p.db, { id: mediaId, spot_id: spot.id, file_path: filePath, created_at: at });
  return { spot, mediaId };
}

async function download(client: SupabaseClient, path: string) {
  const { data, error } = await client.storage.from('photos').download(path);
  return { bytes: data ? new Uint8Array(await data.arrayBuffer()) : null, error };
}

/** The objects under `sends/<sendId>/`, as the service role sees them (RLS can't hide one). */
async function sendObjects(sendId: string): Promise<string[]> {
  const { data, error } = await adminClient().storage.from('photos').list(`sends/${sendId}`);
  if (error) throw error;
  return data.map((o) => o.name);
}

/** ben's received sends (a null would mean his session is gone). */
async function inboxOf(p: Phone): Promise<SendItem[]> {
  const items = await loadSends(p.client, p.userId);
  if (!items) throw new Error(`${p.username} has no session`);
  return items;
}

const photoPaths = (item: SendItem) => item.payload.spots.flatMap((s) => s.photos.map((ph) => ph.path));

afterAll(async () => {
  for (const rider of riders) await deleteRiderAndPhotos(rider.email, rider.userId);
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe('send end to end', () => {
  let ana: Phone;
  let ben: Phone;
  const original = ['Courthouse rail', 'Library ledge', 'Plaza bank'];
  let anaSpots: { spot: Spot; mediaId: string }[];
  let first: SendItem;
  let benCopies: Spot[];

  beforeAll(async () => {
    ana = await newPhone('ana');
    ben = await newPhone('ben');
    await befriend(ana, ben);
    anaSpots = [];
    for (const name of original) anaSpots.push(await spotWithPhoto(ana, name));
    await sync(ana.db, ana.client, ana.userId, ana.io);
  });

  it("ana sends 3 spots, then renames one and deletes another; ben's Inbox still holds the 3 as sent", async () => {
    const result = await createSend(ana.db, ana.client, ana.userId, {
      spotIds: anaSpots.map((s) => s.spot.id),
      recipientIds: [ben.userId],
      sender: { username: ana.username, display_name: null },
    });
    expect(result).toEqual({ sentTo: [expect.objectContaining({ id: ben.userId })] });

    await updateSpot(ana.db, anaSpots[0].spot.id, { name: 'Courthouse handrail' });
    await softDeleteSpot(ana.db, anaSpots[1].spot.id);
    await sync(ana.db, ana.client, ana.userId, ana.io);
    // control: the edits reached the server
    const { data: live, error } = await ana.client
      .from('spots')
      .select('id,name,deleted_at')
      .in('id', [anaSpots[0].spot.id, anaSpots[1].spot.id]);
    expect(error).toBeNull();
    expect(live?.find((s) => s.id === anaSpots[0].spot.id)?.name).toBe('Courthouse handrail');
    expect(live?.find((s) => s.id === anaSpots[1].spot.id)?.deleted_at).toEqual(expect.any(String));

    const items = await inboxOf(ben);
    expect(items).toHaveLength(1);
    first = items[0];
    expect(first.from.username).toBe(ana.username);
    expect(first.payload.spots.map((s) => s.name)).toEqual(original);
    expect(first.payload.spots.map((s) => s.photos.length)).toEqual([1, 1, 1]);
    // the send's own copies under sends/<id>/, not ana's photos/<ana>/… paths
    for (const path of photoPaths(first)) {
      expect(path.startsWith(`sends/${first.sendId}/`)).toBe(true);
      expect((await download(ben.client, path)).bytes).toEqual(FIXTURE);
    }
  });

  it('ben saves all 3 as his own spots with their photos, and backs them up', async () => {
    expect(await saveSend(ben.db, ben.client, ben.userId, first, {}, ben.io)).toEqual({
      status: 'saved',
      saved: 3,
      failedPhotos: 0,
    });

    benCopies = await getSpots(ben.db);
    expect(benCopies.map((s) => s.name).sort()).toEqual([...original].sort());
    const anaIds = new Set(anaSpots.map((s) => s.spot.id));
    for (const copy of benCopies) {
      expect(anaIds.has(copy.id)).toBe(false);
      expect(copy).toMatchObject({ owner_id: ben.userId, copied_from_send: first.sendId, from_username: ana.username });
    }
    const media = await getAllMedia(ben.db);
    expect(media).toHaveLength(3);
    expect(new Set(media.map((m) => m.spot_id))).toEqual(new Set(benCopies.map((s) => s.id)));
    for (const m of media) {
      expect(m.owner_id).toBe(ben.userId);
      expect(new Uint8Array(readFileSync(join(ben.dir, m.file_path)))).toEqual(FIXTURE);
    }
    expect(await countPending(ben.db)).toBeGreaterThan(0);
    expect(await inboxOf(ben)).toEqual([]);

    await sync(ben.db, ben.client, ben.userId, ben.io);
    const { data: up, error } = await ben.client
      .from('spots')
      .select('id,owner_id,copied_from_send,from_username')
      .in(
        'id',
        benCopies.map((s) => s.id),
      );
    expect(error).toBeNull();
    expect(up).toHaveLength(3);
    for (const row of up ?? []) {
      expect(row).toMatchObject({ owner_id: ben.userId, copied_from_send: first.sendId, from_username: ana.username });
    }
    for (const m of media) {
      const path = storagePath(ben.userId, m);
      expect((await download(ben.client, path)).bytes).toEqual(FIXTURE);
    }

    const sent = await listSent(ana.db, ana.client, ana.userId);
    expect(sent?.find((s) => s.id === first.sendId)).toMatchObject({ status: 'saved', count: 3 });
  });

  it("ana can't read ben's copies, and ben's second phone pulls them 'From @ana'", async () => {
    const ids = benCopies.map((s) => s.id);
    await pullAll(ana.db, ana.client, ana.userId);
    expect((await getSpots(ana.db)).map((s) => s.id).filter((id) => ids.includes(id))).toEqual([]);
    const { data, error } = await ana.client.from('spots').select('id').in('id', ids);
    expect(error).toBeNull();
    expect(data).toEqual([]);
    const media = await getAllMedia(ben.db);
    expect((await download(ana.client, storagePath(ben.userId, media[0]))).error).not.toBeNull();

    const benAgain = await phoneFor(ben, await signInAgain(ben.email));
    expect(await sync(benAgain.db, benAgain.client, ben.userId, benAgain.io)).toBe(3);
    const pulled = await getSpots(benAgain.db);
    expect(pulled.map((s) => s.id).sort()).toEqual([...ids].sort());
    for (const copy of pulled) {
      expect(copy).toMatchObject({ owner_id: ben.userId, copied_from_send: first.sendId, from_username: ana.username });
    }
  });

  it('a send ana withdraws before ben saves it leaves his Inbox, and its photos go with it', async () => {
    const result = await createSend(ana.db, ana.client, ana.userId, {
      spotIds: [anaSpots[2].spot.id],
      recipientIds: [ben.userId],
      sender: { username: ana.username, display_name: null },
    });
    expect(result).toEqual({ sentTo: [expect.objectContaining({ id: ben.userId })] });
    const received = await inboxOf(ben);
    expect(received).toHaveLength(1);
    const [second] = received;
    expect(second.sendId).not.toBe(first.sendId);
    const [path] = photoPaths(second);
    // control: ben reads it while it waits
    expect((await download(ben.client, path)).bytes).toEqual(FIXTURE);

    const waiting = (await listSent(ana.db, ana.client, ana.userId))?.find((s) => s.id === second.sendId);
    expect(waiting).toMatchObject({ status: 'waiting', count: 1, photoPaths: [path] });

    // the withdrawal alone hides the photo (RLS), before withdrawSend's best-effort remove runs
    expect((await ana.client.rpc('withdraw_send', { p_id: second.sendId })).error).toBeNull();
    expect(await inboxOf(ben)).toEqual([]);
    expect(await sendObjects(second.sendId)).toHaveLength(1);
    expect((await download(ben.client, path)).error).not.toBeNull();

    // withdrawing again is fine (the Sent screen's retry), and removes the photos
    expect(await withdrawSend(ana.client, ana.userId, waiting!)).toBe('withdrawn');
    expect(await sendObjects(second.sendId)).toEqual([]);
    expect(await inboxOf(ben)).toEqual([]);
    expect((await listSent(ana.db, ana.client, ana.userId))?.find((s) => s.id === second.sendId)?.status).toBe(
      'withdrawn',
    );

    // a stale Inbox item saves nothing: its photos are refused, and a save whose every photo failed asks the server
    // nothing (S7-08: it can't tell a refusal from being offline), so it reads 'failed' and leaves no pending save
    const before = (await getSpots(ben.db)).length;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(await saveSend(ben.db, ben.client, ben.userId, second, {}, ben.io)).toEqual({ status: 'failed' });
      expect(hasPendingSave(ben.userId, second.sendId)).toBe(false);
      // refused at the download, never sent to mark_send_saved
      const warned = warn.mock.calls.map((call) => String(call[0]));
      expect(warned.some((w) => w.startsWith('[sends] could not download photo'))).toBe(true);
      expect(warned.some((w) => w.startsWith('[sends] saving a send failed'))).toBe(false);
    } finally {
      warn.mockRestore();
    }
    expect(await getSpots(ben.db)).toHaveLength(before);
    // and had it asked, the server refuses to save a withdrawn send (what saveSend reads as 'taken_back')
    const marked = await ben.client.rpc('mark_send_saved', { p_id: second.sendId, p_token: newId() });
    expect(marked.error?.code).toBe('42501');
  });

  it('ana cannot withdraw the send ben saved', async () => {
    const direct = await ana.client.rpc('withdraw_send', { p_id: first.sendId });
    expect(direct.error?.code).toBe('55000');
    const sent = (await listSent(ana.db, ana.client, ana.userId))?.find((s) => s.id === first.sendId);
    expect(await withdrawSend(ana.client, ana.userId, sent!)).toBe('saved');
    // and its photos stay
    expect(await sendObjects(first.sendId)).toHaveLength(3);
  });

  it("ben sees ana's real username whatever sender her phone writes into the payload (D80)", async () => {
    const result = await createSend(ana.db, ana.client, ana.userId, {
      spotIds: [anaSpots[2].spot.id],
      recipientIds: [ben.userId],
      sender: { username: 'not_ana', display_name: 'Someone else' },
    });
    expect(result).toEqual({ sentTo: [expect.objectContaining({ id: ben.userId })] });
    const received = await inboxOf(ben);
    expect(received).toHaveLength(1);
    const [forged] = received;
    expect(forged.from.username).toBe(ana.username);
    expect(forged.from.username).not.toBe('not_ana');
    // the server stamps the profile's display name too (ana never set one)
    expect(forged.from.display_name).toBeNull();

    await dismissSend(ben.client, ben.userId, forged.sendId);
    expect(await inboxOf(ben)).toEqual([]);
  });

  it("a staged photo is only ana's (D77)", async () => {
    const sendId = newId();
    const staged = `sends/${sendId}/${newId()}.jpg`;
    const { error } = await ana.client.storage
      .from('photos')
      .copy(storagePath(ana.userId, { id: anaSpots[2].mediaId, spot_id: anaSpots[2].spot.id }), staged);
    expect(error).toBeNull();
    expect((await download(ana.client, staged)).bytes).toEqual(FIXTURE);
    expect((await download(ben.client, staged)).error).not.toBeNull();

    const removed = await ana.client.storage.from('photos').remove([staged]);
    expect(removed.error).toBeNull();
    expect(await sendObjects(sendId)).toEqual([]);
  });

  it("a send that fails after its photos were copied (they're no longer friends) leaves none behind", async () => {
    const [friendship] = (await loadFriends(ben.client, ben.userId))!.friends;
    await removeFriend(ben.client, ben.userId, friendship.friendshipId);

    // every StorageFileApi shares one prototype; the spy records where createSend copied to
    const proto = Object.getPrototypeOf(ana.client.storage.from('photos')) as { copy: (...args: unknown[]) => unknown };
    const copy = jest.spyOn(proto, 'copy');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    let result;
    let copiedTo: string[] = [];
    try {
      result = await createSend(ana.db, ana.client, ana.userId, {
        spotIds: [anaSpots[2].spot.id],
        recipientIds: [ben.userId],
        sender: { username: ana.username, display_name: null },
      });
    } finally {
      warn.mockRestore();
      copiedTo = copy.mock.calls.map((call) => call[1] as string);
      copy.mockRestore();
    }

    expect(result?.sentTo).toEqual([]);
    expect(result?.failed).toEqual({
      to: expect.objectContaining({ id: ben.userId }),
      message: expect.stringContaining('friends'),
    });
    expect(copiedTo).toHaveLength(1);
    const sendId = copiedTo[0].split('/')[1];
    expect(copiedTo[0]).toBe(`sends/${sendId}/${anaSpots[2].mediaId}.jpg`);
    expect(await sendObjects(sendId)).toEqual([]);
    expect(await inboxOf(ben)).toEqual([]);
  });
});
